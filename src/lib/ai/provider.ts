import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getAiEnv } from "@/lib/env";

export const nonThinkingProviderOptions = {
  configured: { thinking: { type: "disabled" } },
} as const;

export function createConfiguredProvider() {
  const result = getAiEnv();
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
