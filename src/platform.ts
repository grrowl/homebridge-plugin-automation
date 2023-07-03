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
import _debug from 'debug';

const debug = _debug(PLUGIN_NAME);

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
    debug('AI: Preparing for launch...');
    this.api.on('didFinishLaunching', () => {
      debug('AI: Launching...');
      this.connectSocket();
      // Assuming that the 'hap' object has a 'bridge' property
      const bridge = (this.api.hap as any).bridge;
      bridge.on('accessory-register', (accessory: PlatformAccessory) => {
        debug(`Reigstred accessory ${accessory.displayName}`);
        this.configureAccessory(accessory);
      });
    });
  }

  connectSocket(): void {
    this.socket = io(UPSTREAM_API);

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0; // reset reconnect attempts
      // Send the status of all devices when the connection is established
      const bridge = (this.api.hap as any).bridge;
      bridge.bridgedAccessories.forEach((accessory: PlatformAccessory) => {
        accessory.services.forEach((service: Service) => {
          service.characteristics.forEach((characteristic: Characteristic) => {
            const message = createMessage(accessory, service, characteristic);
            this.socket?.emit('deviceStatus', message);
          });
        });
      });
    });

    this.socket.on('deviceStatus', (message: DeviceStatusMessage<CharacteristicValue | null | undefined>) => {
      // Update the device properties when a message is received from the upstream API
      const bridge = (this.api.hap as any).bridge;
      const accessory = bridge.bridgedAccessories.find(
        (accessory: PlatformAccessory) => accessory.UUID === message.id,
      );
      const service = accessory?.getService(message.type);
      const characteristic = service?.getCharacteristic(message.characteristic);
      characteristic?.updateValue(message.value!);
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
    // Setup event listeners for accessory changes
    accessory.services.forEach((service: Service) => {
      service.characteristics.forEach((characteristic: Characteristic) => {
        characteristic.on('change', ({ oldValue, newValue }) => {
          // Send a WebSocket message to the upstream API when the device status changes
          if (oldValue !== newValue) {
            const message = createMessage(accessory, service, characteristic);
            this.socket?.emit('deviceStatus', message);
          }
        });
      });
    });
  }
}
