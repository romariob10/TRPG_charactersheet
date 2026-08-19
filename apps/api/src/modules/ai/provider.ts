import {
  createOpenAICompatible,
  type OpenAICompatibleProvider,
} from "@ai-sdk/openai-compatible";
import {
  resolveAiSettings,
  type AiSettingsReader,
  type AiProviderName,
} from "@mycharacter/storage";

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
  providerOptions: typeof economicalQwenProviderOptions | undefined;
}

export async function createConfiguredProvider(
  settingsStore: AiSettingsReader,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ConfiguredProvider> {
  const settings = await resolveAiSettings(settingsStore, environment);
  if (!settings) throw new Error("AI provider is not configured");
  const provider = createOpenAICompatible({
    name: "configured",
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
    includeUsage: true,
    supportsStructuredOutputs: false,
  });
  return {
    provider,
    chatModel: provider(settings.chatModel),
    visionModel: provider(settings.visionModel),
    visionSupportsImages: settings.visionSupportsImages,
    providerOptions: providerOptionsFor(settings.provider),
  };
}

export function providerOptionsFor(provider: AiProviderName) {
  return provider === "qwen" ? economicalQwenProviderOptions : undefined;
}
