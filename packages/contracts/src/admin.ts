import { z } from "zod";

export const aiProviderSchema = z.enum([
  "qwen",
  "openai",
  "openrouter",
  "custom",
]);

export const updateAiSettingsRequestSchema = z.object({
  provider: aiProviderSchema,
  apiKey: z.string().trim().min(8).max(512).optional(),
  baseUrl: z.url().max(500),
  chatModel: z.string().trim().min(1).max(200),
  visionModel: z.string().trim().min(1).max(200),
  visionSupportsImages: z.boolean(),
});

export const aiSettingsResponseSchema = z.object({
  provider: aiProviderSchema,
  baseUrl: z.url(),
  chatModel: z.string(),
  visionModel: z.string(),
  visionSupportsImages: z.boolean(),
  configured: z.boolean(),
  keyHint: z.string().nullable(),
  source: z.enum(["admin", "environment", "none"]),
});

export const adminOverviewResponseSchema = z.object({
  users: z.object({
    total: z.number().int().nonnegative(),
    admins: z.number().int().nonnegative(),
    moderators: z.number().int().nonnegative(),
    newLast24h: z.number().int().nonnegative(),
    newLast7d: z.number().int().nonnegative(),
  }),
  content: z.object({
    posts: z.number().int().nonnegative(),
    characters: z.number().int().nonnegative(),
    templates: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
  }),
  system: z.object({
    aiConfigured: z.boolean(),
    aiProvider: z.string(),
    nodeEnv: z.string(),
  }),
  recentAudit: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      actorRole: z.string(),
      actorUsername: z.string().nullable().optional(),
      targetType: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export type AiProvider = z.infer<typeof aiProviderSchema>;
export type UpdateAiSettingsRequest = z.infer<
  typeof updateAiSettingsRequestSchema
>;
export type AiSettingsResponse = z.infer<typeof aiSettingsResponseSchema>;
export type AdminOverviewResponse = z.infer<
  typeof adminOverviewResponseSchema
>;
