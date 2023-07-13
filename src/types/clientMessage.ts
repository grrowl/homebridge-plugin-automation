import { ServiceType } from "@oznu/hap-client";

interface VersionedMessage {
  version: 1;
  apiKey: string;
}

export interface DeviceStatus<T> {
  id: string;
  type: string;
  characteristic: string;
  value: T;
}

export interface DeviceList extends VersionedMessage {
  type: "deviceList";
  data: any; //DeviceStatus<any>[];
}

export interface DeviceStatusChange extends VersionedMessage {
  type: "deviceStatusChange";
  data: DeviceStatus<any>;
}

export type Message = DeviceList | DeviceStatusChange;

// functions to reduce full objects to simpler representations over the wire

export const reduceService = (service: ServiceType) => ({
  name: service.serviceName,
  uuid: service.uuid,
  type: service.type,
  characteristics: service.serviceCharacteristics.map((characteristic) => ({
    uuid: characteristic.uuid,
    type: characteristic.type,
  })),
});
