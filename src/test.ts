import EventEmitter from "node:events";
import { HomebridgeAutomation } from "./platform";
import { Logger } from "homebridge/lib/logger";

class FakeAPI extends EventEmitter {}

const instance = new HomebridgeAutomation(
  new Logger(),
  {} as any,
  new FakeAPI() as any,
);

// eslint-disable-next-line no-console
console.log({ instance });
