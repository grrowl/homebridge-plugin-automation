interface VersionedMessage {
  version: 1;
}

interface SetCharacteristicData {
  serviceId: string;
  iid: number;
  value: number | string | boolean;
}

interface SetCharacteristic extends VersionedMessage {
  type: "SetCharacteristic";
  data: SetCharacteristicData;
}

interface Future extends VersionedMessage {
  type: "Future";
  data: unknown;
}

export type ServerMessage = SetCharacteristic | Future;
