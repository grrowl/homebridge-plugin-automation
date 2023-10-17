import {
  CharacteristicType,
  HapClient,
  HapInstance,
  ServiceType,
} from "@oznu/hap-client";
import { HapMonitor } from "@oznu/hap-client/dist/monitor";
import type {
  DynamicPlatformPlugin,
  API as HomebridgeAPI,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from "homebridge";
import WebSocket from "ws";
import { ServerMessage, ServerMessageSchema } from "./schemas/ServerMessage";
import { UPSTREAM_API } from "./settings";
import { debounce } from "./util/debounce";
import { findConfigPin } from "./util/findConfigPin";
import { ServiceSchema } from "./schemas/Service";
import { ClientMessage, MetricsData } from "./schemas/ClientMessage";

// how long after the last instance was discovered to start monitoring
const START_MONITORING_DELAY = 4_000;
// send a full state update to the server (assuming all instances have been discovered)
const SEND_STATE_DELAY = 20_000;
// don't backoff further than 15 minutes
const MAX_BACKOFF = 1000 * 60 * 15;
// don't flood metrics
const METRIC_DEBOUNCE = 1_500;
// only reset reconnection backoff once the connection is open for 5 seconds
const CONNECTION_RESET_DELAY = 5_000;

export class HomebridgeAI implements DynamicPlatformPlugin {
  private socket?: WebSocket;
  private reconnectAttempts = 0;
  private messageBuffer: string[] = [];
  private socketReady = false;

  private hap: HapClient;
  private hapMonitor?: HapMonitor;
  private hapReady = false;

  private servicesCache: ServiceType[] = [];

  private metrics: MetricsData = {};

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
      logger:
        process.env.NODE_ENV === "development"
          ? console
          : {
              log: () => {},
              error: (e: any) => this.log.error(e),
              warn: (e: any) => this.log.warn(e),
            },
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
    const wsAddress = new URL(`${UPSTREAM_API}`);
    this.log.debug(`Connecting to ${wsAddress}`);
    this.socket = new WebSocket(wsAddress, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      rejectUnauthorized: process.env.NODE_ENV !== "development", // allow self-signed certs in dev
    });

    let resetReconnectTimeout: NodeJS.Timeout;
    this.socket.on("open", () => {
      this.log.info("Server connection ready");

      resetReconnectTimeout = setTimeout(() => {
        this.reconnectAttempts = 0; // reset reconnect attempts
      }, CONNECTION_RESET_DELAY);

      this.incrementMetric("connectionCount");
      this.socketReady = true;
      this.flushMessageBuffer();
    });

    this.socket.on("message", async (message) => {
      let parsed: unknown[];
      try {
        parsed = JSON.parse(message.toString());
        if (!Array.isArray(parsed)) {
          parsed = [parsed];
        }
      } catch (error) {
        this.log.warn(`ServerMessage not parseable`);
        this.incrementMetric("invalidServerMessages");
        return;
      }

      for (const raw of parsed) {
        const messageParse = ServerMessageSchema.safeParse(raw);
        if (!messageParse.success) {
          this.log.error(
            `Invalid ServerMessage -- please update homebridge-ai to the latest version`,
            // messageParse.error,
          );
          this.log.warn(
            `→ https://homebridgeai.com/help/invalid-servermessage`,
          );
          this.incrementMetric("invalidServerMessages");
          return;
        }
        this.handleMessage(messageParse.data);
      }
    });

    let addTimeout = 0;
    this.socket.on("error", (error) => {
      this.log.error("Connection error:", error.message);

      if (/Unexpected server response: 401/.test(error.message)) {
        this.log.warn(
          `→ Your HomebridgeAI API key is incorrect. Please visit https://homebridgeai.com/help/invalid-api-key`,
        );
        addTimeout += 120_000;
      } else if (/Unexpected server response: 429/.test(error.message)) {
        addTimeout += 10_000;
      }

      this.incrementMetric("connectionErrors");
      // 'close' will also be called
    });

    this.socket.on("close", (code, reason) => {
      this.socketReady = false;
      const timeout =
        Math.min(1000 * Math.pow(2, this.reconnectAttempts), MAX_BACKOFF) +
        addTimeout;

      clearTimeout(resetReconnectTimeout); // if connection closes soon after opening, we don't reset counter
      this.reconnectAttempts++;
      this.incrementMetric("reconnectAttempts");

      switch (code) {
        case 1000:
          break;
        case 1012: // server restarting
          this.log.info(`Server restarting`);
          break;
        case 1006: // connection closed abnormaly
          break;
        case 1009:
        case 1003:
          this.log.warn(
            `Update not accepted: ${reason}. You may need to update homebridge-ai`,
          );
          break;
        default:
          this.log.warn(`Connection error: ${code} ${reason.toString()}`);
      }

      this.log.warn(
        `Disconnected from server, waiting to reconnect... (${Math.floor(
          timeout / 1000,
        )}s)`,
      );
      setTimeout(() => this.connectSocket(), timeout); // exponential backoff
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
      data: services
        .map((service) => {
          const serviceParse = ServiceSchema.safeParse(service);
          if (!serviceParse.success) {
            this.log.warn(
              `Unparseable service "${service.serviceName}"`,
              serviceParse.error,
            );
            this.incrementMetric("invalidServices");
            return null;
          }
          return serviceParse.data;
        })
        .filter((s): s is Exclude<typeof s, null> => s !== null),
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
      this.incrementMetric("bufferedMessages");
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
          `Set ${service.serviceName}/${service.uniqueId?.substring(0, 3)}: ${
            infoCharacteristic?.type
          }/${data.iid} to ${data.value}`,
        );
        this.handleCharacteristicAction(
          this.hap.setCharacteristic(service, data.iid, data.value),
        );

        break;
      }

      default:
        return type satisfies never;
    }

    return;
  }

  // generic async handler for ServerMessages (since handleMessage must be sync)
  handleCharacteristicAction<T extends CharacteristicType>(
    promise: Promise<T>,
  ) {
    promise
      .then((char: T) => {
        this.log.debug(
          `Set ${char.serviceName} result: ${char?.type}/${char.iid} to ${char.value}`,
        );
      })
      .catch((error) => {
        this.log.error("Set error", error);
      });
  }

  incrementMetric(metric: keyof MetricsData) {
    this.metrics[metric] = (this.metrics[metric] || 0) + 1;
    this.sendMetrics();
  }

  private debounceTimeout?: NodeJS.Timeout;
  sendMetrics(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(() => {
      if (!this.socketReady) {
        // never buffer these
        return;
      }

      this.sendMessage({
        type: "metricsChange",
        data: this.metrics,
      });
    }, METRIC_DEBOUNCE);
  }

  configureAccessory(_accessory: PlatformAccessory): void {
    this.log.debug(
      `Got configure accessory call for ${_accessory.displayName} ${_accessory.UUID}`,
    );
    // This plugin doesn't own any accessories so we don't need to implement this
  }
}
