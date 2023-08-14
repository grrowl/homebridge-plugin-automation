import { z } from "zod";
import { CharacteristicSchema } from "./Characteristic";

export const ServiceSchema = z.object({
  aid: z.number(),
  iid: z.number(),
  uuid: z.string(),
  type: z.string(),
  humanType: z.string(),
  linked: z
    .optional(z.array(z.number()))
    .describe("iids sharing aid related to this service"),

  // annoying cyclic schema dependency, but we don't need it
  // linkedServices: z.optional(z.record(ServiceType)),

  hidden: z.optional(z.boolean()), // we don't see these anyway
  serviceName: z.string(),
  serviceCharacteristics: z.array(CharacteristicSchema),

  // accessoryInformation: z
  //   .object({
  //     Manufacturer: z.string().optional(),
  //     "Serial Number": z.string().optional(),
  //     "Firmware Revision": z.string().optional(),
  //     Model: z.string().optional(),
  //     Name: z.string().optional(),
  //   })
  //   .passthrough(),

  // we get values in serviceCharacteristics
  // values: z.unknown(),

  // omitted for privacy
  // instance: z.object({
  //   ipAddress: z.string(),
  //   port: z.number(),
  //   username: z.string(),
  //   name: z.string(),
  // }),

  // @oznu/hap-client special, hash of instance + aid + iid + type
  // so we don't need instance data, good for privacy
  // https://github.com/oznu/hap-client/blob/965e7bec852d860b3e2733249f4222eebe8522d2/src/index.ts#L316
  // this is the service identifier used on the wire
  uniqueId: z.optional(z.string()),
});

export type ServiceType = z.infer<typeof ServiceSchema>;
