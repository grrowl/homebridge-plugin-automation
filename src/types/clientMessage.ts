interface VersionedMessage {
  version: 1;
}

export interface DeviceStatus<T> {
  id: string;
  type: string;
  characteristic: string;
  value: T;
}

export interface DeviceList extends VersionedMessage {
  type: "deviceList";
  data: DeviceStatus<any>[];
}

export interface DeviceStatusChange extends VersionedMessage {
  type: "deviceStatusChange";
  data: DeviceStatus<any>;
}

export type Message = DeviceList | DeviceStatusChange;
