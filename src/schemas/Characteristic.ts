import { z } from "zod";

export const CharacteristicSchema = z.object({
  aid: z.number(),
  iid: z.number(),
  // uuid: z.optional(z.string()),

  type: z.string(),
  description: z.string(), // humanType

  // serviceType: z.string(), // inferred from relationship
  // serviceName: z.string(), // inferred from relationship

  // value is optional, missing for some Hue remote buttons and TV virtual keys
  value: z.optional(z.union([z.number(), z.string(), z.boolean(), z.null()])),
  format: z.enum([
    "bool",
    "int",
    "float",
    "string",
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "data",
    "tlv8",
    "array",
    "dictionary",
  ]),

  // see https://github.com/homebridge/HAP-NodeJS/blob/93a9743c6ae5b6ba3cb4949ef418341234812226/src/lib/Characteristic.ts#L352
  perms: z.array(z.enum(["pr", "pw", "ev", "aa", "tw", "hd", "wr"])),

  unit: z.optional(
    z.enum(["unit", "percentage", "celsius", "arcdegrees", "lux", "seconds"]),
  ),

  // numeric characteristic
  maxValue: z.optional(z.number()),
  minValue: z.optional(z.number()),
  minStep: z.optional(z.number()),

  // not supported in @oznu/hap-client, but may be passed through:
  // string characteristic
  maxLen: z.optional(z.number()),
  // data characteristic
  validValues: z.optional(z.number().array()),
  validValueRanges: z.optional(z.tuple([z.number(), z.number()])),

  // @oznu/hap-client calculated properties from perms
  canRead: z.boolean(),
  canWrite: z.boolean(),
  ev: z.boolean(),
});

export type CharacteristicType = z.infer<typeof CharacteristicSchema>;
