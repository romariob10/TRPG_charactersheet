import {
  createOpenAICompatible,
  type OpenAICompatibleProvider,
} from "@ai-sdk/openai-compatible";
import { z } from "zod";

const optionalEnvironmentValue = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const aiEnvironmentSchema = z
  .object({
    AI_BASE_URL: z.url(),
    AI_API_KEY: optionalEnvironmentValue,
    AI_PRIMARY_API_KEY: optionalEnvironmentValue,
    AI_CHAT_MODEL: z.string().min(1),
    AI_VISION_MODEL: optionalEnvironmentValue,
    AI_VISION_SUPPORTS_IMAGES: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  })
  .refine((environment) => environment.AI_PRIMARY_API_KEY ?? environment.AI_API_KEY, {
    message: "AI_API_KEY or AI_PRIMARY_API_KEY is required",
  });

export const economicalQwenProviderOptions = {
  // Qwen3.8-Max-Preview cannot disable reasoning. Use its smallest supported
  // reasoning budget for concise tool calls and structured field matching.
  configured: { reasoningEffort: "low" },
} as const;

interface ConfiguredProvider {
  provider: OpenAICompatibleProvider;
  chatModel: ReturnType<OpenAICompatibleProvider>;
  visionModel: ReturnType<OpenAICompatibleProvider>;
  visionSupportsImages: boolean;
}

export function createConfiguredProvider(): ConfiguredProvider {
  const result = aiEnvironmentSchema.safeParse(process.env);
  if (!result.success) throw new Error("AI provider is not configured");
  const apiKey = result.data.AI_PRIMARY_API_KEY ?? result.data.AI_API_KEY;
  if (!apiKey) throw new Error("AI provider is not configured");
  const provider = createOpenAICompatible({
    name: "configured",
    apiKey,
    baseURL: result.data.AI_BASE_URL,
    includeUsage: true,
    supportsStructuredOutputs: false,
  });
  return {
    provider,
    chatModel: provider(result.data.AI_CHAT_MODEL),
    visionModel: provider(result.data.AI_VISION_MODEL ?? result.data.AI_CHAT_MODEL),
    visionSupportsImages: result.data.AI_VISION_SUPPORTS_IMAGES,
  };
}
