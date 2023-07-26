import { HapClient, HapInstance, ServiceType } from "@oznu/hap-client";
import { HapMonitor } from "@oznu/hap-client/dist/monitor";
import type {
  DynamicPlatformPlugin,
  API as HomebridgeAPI,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from "homebridge";
import WebSocket from "ws";
import { UPSTREAM_API } from "./settings";
import { debounce } from "./util/debounce";
import { ClientMessage, ClientService } from "./schemas/ClientMessage";
import { ServerMessage } from "./schemas/ServerMessage";

const START_MONITORING_DELAY = 4000;

export class HomebridgeAI implements DynamicPlatformPlugin {
  private socket?: WebSocket;
  private reconnectAttempts = 0;

  private hap: HapClient;
  private hapMonitor?: HapMonitor;

  private hapReady = false;
  private socketReady = false;

  private servicesCache: ServiceType[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: HomebridgeAPI,
  ) {
    this.log.info("Preparing for launch...");

    const pin = config.pin; // FIXME: [CD-32]

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
    }, 20_000);
  }

  connectSocket(): void {
    this.socket = new WebSocket(UPSTREAM_API, {
      rejectUnauthorized: process.env.NODE_ENV !== "development", // allow self-signed certs in dev
    });

    this.socket.on("open", () => {
      this.log.info("Server connection ready");
      this.reconnectAttempts = 0; // reset reconnect attempts
      this.socketReady = true;
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
      // this.log.debug("monitor service-update", responses);

      // TODO: update this.servicesCache i think?
      // although this will only be characteristic updates, not service existence

      responses.forEach((response) => {
        this.sendMessage({
          type: "deviceStatusChange",
          data: response,
        });
      });
    });
  }

  async sendStateUpdate() {
    const services = await this.hap.getAllServices();

    // TODO: maybe call startMonitoring here?

    this.sendMessage({
      type: "deviceList",
      data: services.map((service) => ClientService.parse(service)),
    });

    this.servicesCache = services;
  }

  sendMessage(message: Omit<ClientMessage, "version" | "apiKey">): void {
    const versionedMessage = {
      version: 1,
      apiKey: this.config.apiKey,
      ...message,
    };
    this.socket?.send(JSON.stringify(versionedMessage));
  }

  handleMessage({ type, data }: ServerMessage) {
    this.log.debug(`Server message ${type} ${JSON.stringify(data)}`);

    switch (type) {
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
