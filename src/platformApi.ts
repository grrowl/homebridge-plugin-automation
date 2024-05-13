import { type ServiceType } from "./schemas/Service";

type ListenerFn = (data: ServiceType) => void;

declare global {
  const __sendMessage: (data: unknown) => void;
}

export const platformApi = {
  services: [] as ServiceType[],
  listenerFn: undefined as ListenerFn | undefined,

  listen(fn: ListenerFn) {
    this.listenerFn = fn;
  },

  handleMessage(message) {
    if (message.type === "deviceStatusChange") {
      const service = platformApi.services.find(
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
      platformApi.services = message.data;
      return platformApi.services.length;
    }
    return "Event ignored";
  },

  set(serviceId, iid, value) {
    __sendMessage({
      version: 1,
      type: "SetCharacteristic",
      data: {
        serviceId,
        iid,
        value,
      },
    });
  },
};
