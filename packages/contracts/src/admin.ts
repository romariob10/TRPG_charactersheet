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

export type AiProvider = z.infer<typeof aiProviderSchema>;
export type UpdateAiSettingsRequest = z.infer<
  typeof updateAiSettingsRequestSchema
>;
export type AiSettingsResponse = z.infer<typeof aiSettingsResponseSchema>;
