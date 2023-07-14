import { HapClient, HapInstance } from "@oznu/hap-client";
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
import { ClientMessage } from "./types/clientMessage";
import { ServerMessage } from "./types/serverMessage";
import { debounce } from "./util/debounce";

const START_MONITORING_DELAY = 4000;

export class HomebridgeAI implements DynamicPlatformPlugin {
  private socket: WebSocket;
  private reconnectAttempts = 0;

  private hap: HapClient;
  private hapMonitor?: HapMonitor;

  private hapReady = false;
  private socketReady = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: HomebridgeAPI,
  ) {
    this.log.info("Preparing for launch...");

    const pin = config.pin;

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

  async startMonitoring() {
    if (this.hapMonitor) {
      this.log.warn(`Already monitoring, skipping ...`);
      return;
    }

    this.log.info(`Start monitoring`);

    // TODO: this calls getAllServices under the hood -- we also need services,, so we can optimise and new HapMonitor directly like before
    this.hapMonitor = await this.hap.monitorCharacteristics();

    this.hapMonitor.on("service-update", (responses) => {
      this.log.debug("monitor service-update", responses);

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
      data: services,
    });
  }

  async fetchAllDevicesAndCharacteristics() {
    if (!this.hapReady || !this.socketReady) {
      this.log.warn(
        "Connections not yet ready",
        this.hapReady,
        this.socketReady,
      );
      return;
    }

    // this.hap.HAPaccessories((response) => {
    const services = await this.hap.getAllServices();

    this.log.debug("services", services);

    // const getAccessories = promisify(this.hapClient.HAPaccessories.bind(this.hapClient));
    // const result = await getAccessories();
    // console.log({ result });
    // this.hapClient.HAPaccessories((err: unknown, response: any[]) => {
    //   this.log.info('Got accessories', response);
    //   for (const device of response) {
    //     for (const service of device.services) {
    //       for (const characteristic of service.characteristics) {
    //         this.socket?.emit(
    //           'deviceStatus',
    //           createMessage(device, service, characteristic),
    //         );
    //       }
    //     }
    //   }
    // });
  }

  connectSocket(): void {
    this.socket = new WebSocket(UPSTREAM_API, {
      rejectUnauthorized: process.env.NODE_ENV !== "development",
    });

    this.socket.on("open", () => {
      this.log.info("Server connection ready");
      this.reconnectAttempts = 0; // reset reconnect attempts
      this.socketReady = true;
    });

    this.socket.on("message", async (message) => {
      const { event, data } = JSON.parse(message.toString());

      if (event === "deviceStatus") {
        // Update the device properties when a message is received from the upstream API
        // FIXME: server should control devices
        // await this.hap.HAPcontrol(
        //   "::1",
        //   data.id,
        //   data.type,
        //   data.characteristic,
        //   data.value,
        // );
      }
    });

    this.socket.on("error", (error) => {
      this.log.error("Connection error:", error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts < 50) {
        // setTimeout(() => this.connectSocket(), 1000 * this.reconnectAttempts); // exponential backoff
      } else {
        this.log.error("Failed to reconnect after 50 attempts, stopping...");
      }
    });

    this.socket.on("close", () => {
      this.socketReady = false;
      this.log.warn("Disconnected from server, attempting to reconnect...");
      this.reconnectAttempts = 0;
      this.connectSocket();
    });
  }

  sendMessage(message: Omit<ClientMessage, "version" | "apiKey">): void {
    const versionedMessage = {
      version: 1,
      apiKey: this.config.apiKey,
      ...message,
    };
    this.socket.send(JSON.stringify(versionedMessage));
  }

  handleMessage(_message: ServerMessage): void {
    return;
  }

  configureAccessory(_accessory: PlatformAccessory): void {
    this.log.debug(
      `Got configure accessory call for ${_accessory.displayName} ${_accessory.UUID}`,
    );
    // This plugin doesn't own any accessories so we don't need to implement this
  }
}
