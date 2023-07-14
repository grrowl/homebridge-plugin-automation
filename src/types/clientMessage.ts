import { ServiceType } from "@oznu/hap-client";

interface VersionedMessage {
  version: 1;
  apiKey: string;
}

export interface DeviceList extends VersionedMessage {
  type: "deviceList";
  data: ServiceType[];
}

export interface DeviceStatusChange extends VersionedMessage {
  type: "deviceStatusChange";
  data: ServiceType;
}

export type ClientMessage = DeviceList | DeviceStatusChange;
