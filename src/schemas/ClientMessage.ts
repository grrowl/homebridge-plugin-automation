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

export const MetricsChangeSchema = VersionedMessageSchema.extend({
  type: z.literal("metricsChange"),
  data: z
    .object({
      invalidServices: z.number(),
      invalidServerMessages: z.number(),
      connectionCount: z.number(),
      connectionErrors: z.number(),
      reconnectAttempts: z.number(),
      bufferedMessages: z.number(),
    })
    .partial(),
});
export type MetricsData = z.infer<typeof MetricsChangeSchema>["data"];

export const ClientMessageSchema = z.discriminatedUnion("type", [
  DeviceListSchema,
  DeviceStatusChangeSchema,
  MetricsChangeSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
