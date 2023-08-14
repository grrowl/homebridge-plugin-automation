import { z } from "zod";
import { ServiceSchema } from "./Service";

const VersionedMessageSchema = z.object({
  version: z.literal(1),
});

export const DeviceListSchema = VersionedMessageSchema.extend({
  type: z.literal("deviceList"),
  data: z.array(ServiceSchema),
});

export const DeviceStatusChangeSchema = VersionedMessageSchema.extend({
  type: z.literal("deviceStatusChange"),
  data: ServiceSchema,
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  DeviceListSchema,
  DeviceStatusChangeSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
