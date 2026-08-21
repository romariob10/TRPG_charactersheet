import { z } from "zod";
import { characterIdSchema, fieldValueSchema } from "./characters.js";

const protocolVersion = z.literal(1);
const connectionIdSchema = z.string().uuid();

export const realtimeClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    protocolVersion,
    type: z.literal("subscribe"),
    characterId: characterIdSchema,
    afterRevision: z.number().int().nonnegative(),
  }),
  z.object({
    protocolVersion,
    type: z.literal("unsubscribe"),
    characterId: characterIdSchema,
  }),
  z.object({
    protocolVersion,
    type: z.literal("heartbeat"),
  }),
  z.object({
    protocolVersion,
    type: z.literal("focus"),
    characterId: characterIdSchema,
    fieldId: z.string().uuid().nullable(),
  }),
]);

export const presenceMemberSchema = z.object({
  connectionId: connectionIdSchema,
  userId: z.string().uuid(),
  username: z.string().optional(),
  displayName: z.string().nullable().optional(),
  fieldId: z.string().uuid().nullable(),
});
export type PresenceMember = z.infer<typeof presenceMemberSchema>;

export const fieldChangedEventSchema = z.object({
  protocolVersion,
  type: z.literal("field.changed"),
  characterId: characterIdSchema,
  fieldId: z.string().uuid(),
  value: fieldValueSchema,
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
});

export const realtimeServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    protocolVersion,
    type: z.literal("subscribed"),
    characterId: characterIdSchema,
    connectionId: connectionIdSchema,
    revision: z.number().int().nonnegative(),
  }),
  fieldChangedEventSchema,
  z.object({
    protocolVersion,
    type: z.literal("character.changed"),
    characterId: characterIdSchema,
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    protocolVersion,
    type: z.literal("catalog.progress"),
    templateId: z.string().uuid(),
    status: z.enum(["pending", "processing", "ready", "partial", "failed"]),
    progress: z.number().min(0).max(1),
  }),
  z.object({
    protocolVersion,
    type: z.literal("presence.snapshot"),
    characterId: characterIdSchema,
    members: z.array(presenceMemberSchema),
  }),
  z.object({
    protocolVersion,
    type: z.literal("presence.joined"),
    characterId: characterIdSchema,
    member: presenceMemberSchema,
  }),
  z.object({
    protocolVersion,
    type: z.literal("presence.left"),
    characterId: characterIdSchema,
    connectionId: connectionIdSchema,
  }),
  z.object({
    protocolVersion,
    type: z.literal("error"),
    code: z.string().min(1),
    message: z.string().min(1),
  }),
]);

export const characterChangesResponseSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("changes"),
    revision: z.number().int().nonnegative(),
    changes: z.array(fieldChangedEventSchema),
  }),
  z.object({
    mode: z.literal("snapshot"),
    character: z.unknown(),
  }),
]);

export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;
export type RealtimeServerMessage = z.infer<typeof realtimeServerMessageSchema>;
export type FieldChangedEvent = z.infer<typeof fieldChangedEventSchema>;
export type CatalogProgressEvent = Extract<
  RealtimeServerMessage,
  { type: "catalog.progress" }
>;
export type CharacterChangesResponse = z.infer<typeof characterChangesResponseSchema>;
