import { z } from "zod";

const VersionedMessageSchema = z.object({
  version: z.literal(1).default(1),
});

export const SetCharacteristicSchema = VersionedMessageSchema.extend({
  type: z.literal("SetCharacteristic"),
  data: z.object({
    serviceId: z.string(), // uniqueId
    iid: z.number(),
    value: z.union([z.number(), z.string(), z.boolean()]), // can't set to null
  }),
});

export const NotifySchema = VersionedMessageSchema.extend({
  type: z.literal("Notify"),
  data: z.unknown(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  SetCharacteristicSchema,
  NotifySchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
