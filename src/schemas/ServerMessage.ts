import { z } from "zod";

const VersionedMessageSchema = z.object({
  version: z.literal(1),
});

/*
setCharacteristic(
  service: ServiceType,
  iid: number,
  value: number | string | boolean
)
*/
export const SetCharacteristicSchema = VersionedMessageSchema.extend({
  type: z.literal("SetCharacteristic"),
  data: z.object({
    serviceId: z.string(), // uniqueId
    iid: z.number(),
    value: z.union([z.number(), z.string(), z.boolean()]), // can't set to null
  }),
});

export const ServerMessage = SetCharacteristicSchema;

export type ServerMessage = z.infer<typeof ServerMessage>;
