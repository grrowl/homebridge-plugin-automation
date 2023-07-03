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
import { UPSTREAM_API } from './settings';
import { HAPNodeJSClient } from 'hap-node-client';


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
  private hapClient: ReturnType<HAPNodeJSClient>;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: HomebridgeAPI,
  ) {
    this.log.info('AI: Preparing for launch...');

    // Connect to Homebridge in insecure mode
    this.hapClient = new HAPNodeJSClient({ debug: false, keepalive: false });
    this.hapClient.HAPaccessories('::1', () => {
      console.log('AI: hello');
    });

    this.api.on('didFinishLaunching', () => {
      this.log.info('AI: Launching...');
      this.connectSocket();
      this.fetchAllDevicesAndCharacteristics();
      this.hapClient.on('event', this.handleCharacteristicChange.bind(this));
    });
  }


  async fetchAllDevicesAndCharacteristics() {
    const devices = await this.hapClient.HAPaccessories('::1');
    for (const device of devices) {
      for (const service of device.services) {
        for (const characteristic of service.characteristics) {
          this.socket?.emit('deviceStatus', createMessage(device, service, characteristic));
        }
      }
    }
  }


  handleCharacteristicChange(data: any) {
    this.log.debug(`AI: Characteristic changed: ${JSON.stringify(data)}`);
    // Construct and send a message with the updated characteristic
    this.socket?.emit('deviceStatus', createMessage(data.accessory, data.service, data.characteristic));
  }

  connectSocket(): void {
    this.socket = io(UPSTREAM_API);

    this.socket.on('connect', () => {
      this.log.info('AI: Connected to upstream');
      this.reconnectAttempts = 0; // reset reconnect attempts
    });

    this.socket.on('deviceStatus', async (message: DeviceStatusMessage<CharacteristicValue | null | undefined>) => {
      // Update the device properties when a message is received from the upstream API
      await this.hapClient.HAPcontrol('::1', message.id, message.type, message.characteristic, message.value);
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

  configureAccessory(_accessory: PlatformAccessory ): void {
    this.log.debug(`AI: Got configure accessory call for ${_accessory.displayName} ${_accessory.UUID}`);
    // This plugin doesn't own any accessories so we don't need to implement this
  }
}
