export const PLATFORM_SCRIPT = `
const automation = {
  services: [];

  handleMessage(message) {
    if (message.type === "deviceStatusChange") {
      onMessage(message.data);
      const service = automation.services.find(s => s.uniqueId === message.data.uniqueId);
      if (service) {
        Object.assign(service, message.data);
      }
    }
    if (message.type === "deviceList") {
      automation.services = message.data;
    }
  }

  set(serviceId, iid, value) {
    __host({
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
`;
