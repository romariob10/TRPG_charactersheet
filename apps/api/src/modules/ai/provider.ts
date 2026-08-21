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

export const deepSeekProviderOptions = {
  // DeepSeek V4 enables thinking by default. Its thinking mode rejects forced
  // tool_choice and requires reasoning_content replay across tool turns, which
  // the OpenAI-compatible adapter does not preserve. Non-thinking mode keeps
  // regular and forced tool calls compatible with the agent runtime.
  configured: { thinking: { type: "disabled" } },
} as const;

interface ConfiguredProvider {
  provider: OpenAICompatibleProvider;
  chatModel: ReturnType<OpenAICompatibleProvider>;
  visionModel: ReturnType<OpenAICompatibleProvider>;
  visionSupportsImages: boolean;
  providerOptions:
    | typeof economicalQwenProviderOptions
    | typeof deepSeekProviderOptions
    | undefined;
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
    providerOptions: providerOptionsFor(settings.provider, settings.baseUrl),
  };
}

export function providerOptionsFor(provider: AiProviderName, baseUrl = "") {
  if (provider === "qwen") return economicalQwenProviderOptions;
  try {
    if (new URL(baseUrl).hostname.toLowerCase() === "api.deepseek.com") {
      return deepSeekProviderOptions;
    }
  } catch {
    // Invalid URLs are rejected by settings validation before this point.
  }
  return undefined;
}
