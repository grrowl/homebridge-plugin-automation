import { HapClient, HapInstance, ServiceType } from "@oznu/hap-client";
import { HapMonitor } from "@oznu/hap-client/dist/monitor";
import type {
  DynamicPlatformPlugin,
  API as HomebridgeAPI,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from "homebridge";
import qs from "node:querystring";
import WebSocket from "ws";
import { ServerMessage } from "./schemas/ServerMessage";
import { UPSTREAM_API } from "./settings";
import { debounce } from "./util/debounce";
import { findConfigPin } from "./util/findConfigPin";
import { ServiceSchema } from "./schemas/Service";
import { ClientMessage } from "./schemas/ClientMessage";

// how long after the last instance was discovered to start monitoring
const START_MONITORING_DELAY = 4_000;
// send a full state update to the server (assuming all instances have been discovered)
const SEND_STATE_DELAY = 20_000;

export class HomebridgeAI implements DynamicPlatformPlugin {
  private socket?: WebSocket;
  private reconnectAttempts = 0;
  private messageBuffer: string[] = [];
  private socketReady = false;

  private hap: HapClient;
  private hapMonitor?: HapMonitor;
  private hapReady = false;

  private servicesCache: ServiceType[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: HomebridgeAPI,
  ) {
    this.log.info("Preparing for launch...");

    const pin = config.pin || findConfigPin(this.api);
    if (!pin) {
      this.log.error(
        "Homebridge-AI requires a PIN to be configured in the config.json",
      );
    }

    const apiKey = config.apiKey;
    if (!apiKey) {
      this.log.error(
        "Homebridge-AI requires an API Key to be configured in the config.json",
      );
    }

    // Connect to Homebridge in insecure mode
    this.hap = new HapClient({
      pin,
      // logger: this.log,
      logger: console,
      config: {
        debug: true,
      },
    });

    const eventuallyStartMonitoring = debounce(
      this.startMonitoring.bind(this),
      START_MONITORING_DELAY,
    );
    this.hap.on("instance-discovered", (_instance: HapInstance) => {
      this.hapReady = true; // at least one instance is discovered

      eventuallyStartMonitoring();
    });

    // APIEvent.DID_FINISH_LAUNCHING
    this.api.on("didFinishLaunching", () => {
      this.log.info("Launching...");
      this.connectSocket();
    });
    // APIEvent.SHUTDOWN
    this.api.on("shutdown", () => {
      this.log.info("Shutting down");
      this.hapMonitor?.finish();
    });

    setTimeout(async () => {
      this.sendStateUpdate();
    }, SEND_STATE_DELAY);
  }

  connectSocket(): void {
    const wsQuery = qs.stringify({ apiKey: this.config.apiKey });
    const wsAddress = new URL(`${UPSTREAM_API}?${wsQuery}`);
    this.log.debug(`Connecting to ${wsAddress}`);
    this.socket = new WebSocket(wsAddress, {
      rejectUnauthorized: process.env.NODE_ENV !== "development", // allow self-signed certs in dev
    });

    this.socket.on("open", () => {
      this.log.info("Server connection ready");
      this.reconnectAttempts = 0; // reset reconnect attempts
      this.socketReady = true;
      this.flushMessageBuffer();
    });

    this.socket.on("message", async (message) => {
      const parsed = JSON.parse(message.toString());

      if (Array.isArray(parsed)) {
        for (const msg of parsed) {
          this.handleMessage(msg);
        }
      } else {
        this.handleMessage(parsed);
      }
    });

    this.socket.on("error", (error) => {
      this.log.error("Connection error:", error);
      // 'close' will also be called
    });

    this.socket.on("close", () => {
      this.socketReady = false;
      this.log.warn("Disconnected from server, attempting to reconnect...");
      this.reconnectAttempts++;
      setTimeout(
        () => this.connectSocket(),
        1000 * Math.pow(2, this.reconnectAttempts),
      ); // exponential backoff
    });
  }

  async startMonitoring() {
    if (this.hapMonitor) {
      this.log.warn(`Already monitoring, skipping ...`);
      return;
    }

    this.log.info(`Start monitoring for updates`);

    // TODO: this calls getAllServices under the hood -- we also need services,, so we can optimise and new HapMonitor directly like before
    this.hapMonitor = await this.hap.monitorCharacteristics();
    this.hapMonitor.on("service-update", (responses) => {
      // no need to update this.servicesCache as this is only characteristic updates -- cache will be out of date for characteristic state.

      responses.forEach((response) => {
        this.sendMessage({
          type: "deviceStatusChange",
          data: response,
        });
      });
    });
  }

  async sendStateUpdate() {
    // we're sending a full state update, so past updates are irrelevant
    this.clearMessageBuffer();

    const services = await this.hap.getAllServices();

    if (services.length === 0) {
      this.log.warn("No services discovered, perhaps PIN incorrect?");
    }

    // FIXME: this doubles up with HapMonitor's service discovery

    this.sendMessage({
      type: "deviceList",
      data: services.map((service) => ServiceSchema.parse(service)),
    });

    this.servicesCache = services;
  }

  sendMessage(message: Omit<ClientMessage, "version" | "apiKey">): void {
    const versionedMessage = {
      version: 1,
      ...message,
    };
    const json = JSON.stringify(versionedMessage);
    if (this.socketReady) {
      this.socket?.send(json);
    } else {
      this.messageBuffer.push(json);
    }
  }

  flushMessageBuffer(): void {
    while (this.messageBuffer.length > 0) {
      const message = this.messageBuffer.shift();
      if (message) {
        this.socket?.send(message);
      }
    }
  }

  // Clear the message buffer
  clearMessageBuffer(): void {
    this.messageBuffer = [];
  }

  handleMessage({ type, data }: ServerMessage) {
    this.log.debug(`Server message ${type} ${JSON.stringify(data)}`);

    switch (type) {
      case "Notify":
        this.log.info(`Server notification: ${JSON.stringify(data)}`);
        break;

      case "SetCharacteristic": {
        const service = this.servicesCache.find(
          (service) => service.uniqueId === data.serviceId,
        );
        if (!service) {
          this.log.error(`Service ${data.serviceId} not found`);
          return false;
        }

        const infoCharacteristic = service.serviceCharacteristics.find(
          (c) => c.iid === data.iid,
        );
        this.log.info(
          `Setting ${service.serviceName}: ${infoCharacteristic?.type}/${data.iid} to ${data.value}`,
        );
        this.handleMessageAction(
          this.hap.setCharacteristic(service, data.iid, data.value),
        );

        break;
      }

      default:
        return type satisfies never;
    }

    return;
  }

  // generic async handler for ServerMessages
  handleMessageAction<T>(promise: Promise<T>) {
    promise
      .then((value) => this.log.debug("ServerMessage processed", value))
      .catch((error) =>
        this.log.error("ServerMessage error processing", error),
      );
  }

  configureAccessory(_accessory: PlatformAccessory): void {
    this.log.debug(
      `Got configure accessory call for ${_accessory.displayName} ${_accessory.UUID}`,
    );
    // This plugin doesn't own any accessories so we don't need to implement this
  }
}
