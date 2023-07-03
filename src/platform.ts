import {
  Characteristic,
  CharacteristicValue,
  DynamicPlatformPlugin,
  API as HomebridgeAPI,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import { Socket, io } from 'socket.io-client';
import { PLUGIN_NAME, UPSTREAM_API } from './settings';

// Define the message types
interface DeviceStatusMessage<T> {
  id: string;
  type: string;
  characteristic: string;
  value: T;
  version: number;
}

// Abstract the message creation
function createMessage(
  accessory: PlatformAccessory,
  service: Service,
  characteristic: Characteristic,
): DeviceStatusMessage<CharacteristicValue | null | undefined> {
  return {
    id: accessory.UUID,
    type: service.UUID,
    characteristic: characteristic.UUID,
    value: characteristic.value,
    version: 1,
  };
}

export class HomebridgeAI implements DynamicPlatformPlugin {
  private socket: Socket | undefined;
  private reconnectAttempts = 0;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: HomebridgeAPI,
  ) {
    this.log.info('AI: Preparing for launch...');
    this.api.on('didFinishLaunching', () => {
      this.log.info('AI: Launching...');
      this.connectSocket();
      // TODO: connect to HAP API using info from api variable
    });
  }

  connectSocket(): void {
    this.socket = io(UPSTREAM_API);

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0; // reset reconnect attempts
      // TODO: send status of all devices when the connection is established
    });

    this.socket.on('deviceStatus', (message: DeviceStatusMessage<CharacteristicValue | null | undefined>) => {
      // TODO: Update the device properties when a message is received from the upstream API
    });

    this.socket.on('connect_error', (error) => {
      this.log.error('Connection error:', error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts < 50) {
        setTimeout(() => this.connectSocket(), 1000 * this.reconnectAttempts); // exponential backoff
      } else {
        this.log.error('Failed to reconnect after 50 attempts,stopping...');
      }
    });

    this.socket.on('disconnect', () => {
      this.log.warn('Disconnected from server, attempting to reconnect...');
      this.reconnectAttempts = 0;
      this.connectSocket();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    // TODO: Setup event listeners for accessory changes. Do not implement if this will only be called for this plugin's accessories
  }
}
