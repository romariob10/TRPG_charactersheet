import {
  createOpenAICompatible,
  type OpenAICompatibleProvider,
} from "@ai-sdk/openai-compatible";
import { z } from "zod";

const aiEnvironmentSchema = z.object({
  AI_BASE_URL: z.url(),
  AI_API_KEY: z.string().min(1),
  AI_PRIMARY_API_KEY: z.string().min(1).optional(),
  AI_CHAT_MODEL: z.string().min(1),
  AI_VISION_MODEL: z.string().min(1).optional(),
  AI_VISION_SUPPORTS_IMAGES: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export const nonThinkingProviderOptions = {
  configured: { thinking: { type: "disabled" } },
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
  const provider = createOpenAICompatible({
    name: "configured",
    apiKey: result.data.AI_PRIMARY_API_KEY ?? result.data.AI_API_KEY,
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
