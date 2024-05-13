import { type ServiceType } from "./schemas/Service";
import { type ServerMessage } from "./schemas/ServerMessage";

type ListenerFn = (data: ServiceType) => void;
type SendFn = (data: ServerMessage) => void;

export class PlatformApi {
  private services: ServiceType[] = [];
  private listenerFn?: ListenerFn;
  private sendFn: SendFn;

  constructor(sendFn: SendFn) {
    this.sendFn = sendFn;
  }

  listen(fn: ListenerFn) {
    this.listenerFn = fn;
  }

  handleMessage(message) {
    if (message.type === "deviceStatusChange") {
      const service = this.services.find(
        (s) => s.uniqueId === message.data.uniqueId,
      );
      if (service) {
        Object.assign(service, message.data);
      }
      if (typeof this.listenerFn === "undefined") {
        throw new Error("listener not defined");
      }
      return this.listenerFn(message.data);
    }
    if (message.type === "deviceList") {
      this.services = message.data;
      return this.services.length;
    }
    return "Event ignored";
  }

  set(serviceId, iid, value) {
    this.sendFn({
      version: 1,
      type: "SetCharacteristic",
      data: {
        serviceId,
        iid,
        value,
      },
    });
  }
}
