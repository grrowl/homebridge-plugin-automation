import { z } from "zod";

/* ClientCharacteristic and ClientService are purposefully loose so we don't explode the client */

const ClientCharacteristic = z
  .object({
    iid: z.number(),
    value: z.optional(z.union([z.number(), z.string(), z.boolean(), z.null()])),
    serviceType: z.string(),
    serviceName: z.string(),
    type: z.string(),
  })
  .passthrough(); // allow extra keys

export const ClientService = z
  .object({
    uniqueId: z.optional(z.string()),
    serviceCharacteristics: z.array(ClientCharacteristic),
  })
  .passthrough(); // allow extra keys

const VersionedMessageSchema = z.object({
  version: z.literal(1),
});

export const DeviceListSchema = VersionedMessageSchema.extend({
  type: z.literal("deviceList"),
  data: z.array(ClientService),
});

export const DeviceStatusChangeSchema = VersionedMessageSchema.extend({
  type: z.literal("deviceStatusChange"),
  data: ClientService,
});

export const ClientMessage = z.union([
  DeviceListSchema,
  DeviceStatusChangeSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;
