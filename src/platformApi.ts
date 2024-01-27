import { type ServiceType } from "./schemas/Service";

export const platformApi = {
  services: [] as ServiceType[],

  handleMessage(message) {
    if (message.type === "deviceStatusChange") {
      const service = platformApi.services.find(
        (s) => s.uniqueId === message.data.uniqueId,
      );
      if (service) {
        Object.assign(service, message.data);
      }
      return global.onMessage(message.data);
    }
    if (message.type === "deviceList") {
      platformApi.services = message.data;
      return platformApi.services.length;
    }
    return null;
  },

  set(serviceId, iid, value) {
    global.__host({
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

export const PLATFORM_API_JS = `
const automation = {
  services: [],

  handleMessage(message) {
    if (message.type === "deviceStatusChange") {
      const service = automation.services.find(
        (s) => s.uniqueId === message.data.uniqueId,
      );
      if (service) {
        Object.assign(service, message.data);
      }
      return global.onMessage(message.data) || 'no reuslt?';
    }
    if (message.type === "deviceList") {
      automation.services = message.data;
    }
  },

  set(serviceId, iid, value) {
    global.__host({
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
`;
