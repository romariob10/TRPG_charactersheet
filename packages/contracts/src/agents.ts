import { fieldValueSchema } from "./characters.js";
import { z } from "zod";

export const createAgentTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});
export const agentTokenSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export const agentTokenListSchema = z.object({
  tokens: z.array(agentTokenSchema),
});
export const createdAgentTokenSchema = z.object({
  token: z.string(),
  metadata: agentTokenSchema,
});
export const agentResourceSchema = z.object({
  resourceType: z.enum(["character", "sheet"]),
  resourceId: z.string().uuid(),
});
export const agentPresenceRequestSchema = agentResourceSchema.extend({
  target: z.enum(["desktop", "tablet", "mobile", "print"]).default("desktop"),
  x: z.number().finite().min(0).max(1).default(0.5),
  y: z.number().finite().min(0).max(1).default(0.1),
  status: z.string().trim().max(160).default(""),
});
export const agentPresenceSchema = agentPresenceRequestSchema.extend({
  id: z.string().uuid(),
  name: z.string(),
  updatedAt: z.string(),
});
export const agentPresenceListSchema = z.object({
  agents: z.array(agentPresenceSchema),
});
export type AgentResource = z.infer<typeof agentResourceSchema>;
export type AgentPresence = z.infer<typeof agentPresenceSchema>;
export type AgentPresenceRequest = z.infer<typeof agentPresenceRequestSchema>;
export type AgentToken = z.infer<typeof agentTokenSchema>;
export type CreateAgentTokenRequest = z.infer<
  typeof createAgentTokenRequestSchema
>;

export const characterSheetStateSchema = z.object({
  values: z.record(z.string(), fieldValueSchema),
  versions: z.record(z.string(), z.number().int().nonnegative()),
});
