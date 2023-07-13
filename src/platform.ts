import type {
  Characteristic,
  CharacteristicValue,
  DynamicPlatformPlugin,
  API as HomebridgeAPI,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  HAP,
} from "homebridge";
import { APIEvent } from "homebridge";
import WebSocket from "ws";
import { UPSTREAM_API } from "./settings";
import { HAPNodeJSClient } from "hap-node-client";
import { DeviceStatus, Message } from "./types/clientMessage";
import { ServerMessage } from "./types/serverMessage";

function createMessage(
  accessory: PlatformAccessory,
  service: Service,
  characteristic: Characteristic,
): DeviceStatus<any> {
  return {
    id: accessory.UUID,
    type: service.UUID,
    characteristic: characteristic.UUID,
    value: characteristic.value,
  };
}

export class HomebridgeAI implements DynamicPlatformPlugin {
  private socket: WebSocket | undefined;
  private reconnectAttempts = 0;
  private hap: ReturnType<HAPNodeJSClient>;

  private hapReady = false;
  private socketReady = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: HomebridgeAPI,
  ) {
    this.log.info("Preparing for launch...");

    // Connect to Homebridge in insecure mode
    this.hap = new HAPNodeJSClient({
      debug: false,
      pin: undefined,
    });

    this.hap.on("Ready", () => {
      this.log.info("HAP Ready");
      this.hapReady = true;
      this.fetchAllDevicesAndCharacteristics();
    });

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.info("Launching...");
      this.connectSocket();
      // this.fetchAllDevicesAndCharacteristics();
      this.hap.on("event", this.handleCharacteristicChange.bind(this));
    });
    this.api.on(APIEvent.SHUTDOWN, () => {
      this.log.info("Shutting down");
      this.connectSocket();
      // this.fetchAllDevicesAndCharacteristics();
      this.hap.on("event", this.handleCharacteristicChange.bind(this));
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

    this.hap.HAPaccessories((response) => {
      this.log.info("BOOT Got accessories", typeof response, response?.length);
      this.log.debug(response);
      this.log.debug(response?.[0]?.accessories?.accessories);

      this.sendMessage({
        type: "deviceList",
        data: response.map((data) =>
          createMessage(data.accessory, data.service, data.characteristic),
        ),
      });
    });

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

  handleCharacteristicChange(data: any) {
    this.log.debug(`Characteristic changed: ${JSON.stringify(data)}`);
    this.sendMessage({
      type: "deviceStatusChange",
      data: createMessage(data.accessory, data.service, data.characteristic),
    });
  }

  connectSocket(): void {
    this.socket = new WebSocket(UPSTREAM_API, {
      rejectUnauthorized: process.env.NODE_ENV !== "development",
    });

    this.socket.on("open", () => {
      this.log.info("Server connection ready");
      this.reconnectAttempts = 0; // reset reconnect attempts
      this.socketReady = true;
      this.fetchAllDevicesAndCharacteristics();
    });

    this.socket.on("message", async (message) => {
      const { event, data } = JSON.parse(message.toString());

      if (event === "deviceStatus") {
        // Update the device properties when a message is received from the upstream API
        await this.hap.HAPcontrol(
          "::1",
          data.id,
          data.type,
          data.characteristic,
          data.value,
        );
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
      // this.connectSocket();
    });
  }

  sendMessage(message: Omit<Message, "version">): void {
    this.socket?.send(
      JSON.stringify({
        version: 1,
        ...message,
      }),
    );
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
