import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSettingsReader } from "@mycharacter/storage";
import {
  createConfiguredProvider,
  deepSeekProviderOptions,
  economicalQwenProviderOptions,
} from "../src/modules/ai/provider.js";

describe("AI provider configuration", () => {
  const emptyStore: AiSettingsReader = { read: async () => null };
  afterEach(() => vi.unstubAllEnvs());

  it("accepts blank optional variables from dotenv files", async () => {
    vi.stubEnv(
      "AI_BASE_URL",
      "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    );
    vi.stubEnv("AI_API_KEY", "qwen-test-key");
    vi.stubEnv("AI_PRIMARY_API_KEY", "");
    vi.stubEnv("AI_CHAT_MODEL", "qwen3.8-max-preview");
    vi.stubEnv("AI_VISION_MODEL", "");
    vi.stubEnv("AI_VISION_SUPPORTS_IMAGES", "true");

    const configured = await createConfiguredProvider(emptyStore);

    expect(configured.chatModel.modelId).toBe("qwen3.8-max-preview");
    expect(configured.visionModel.modelId).toBe("qwen3.8-max-preview");
    expect(configured.visionSupportsImages).toBe(true);
  });

  it("only sends Qwen-specific reasoning options to Qwen", async () => {
    const store: AiSettingsReader = {
      read: async () => ({
        provider: "openai",
        apiKey: "openai-test-key",
        baseUrl: "https://api.openai.com/v1",
        chatModel: "chat-model",
        visionModel: "vision-model",
        visionSupportsImages: true,
      }),
    };

    const configured = await createConfiguredProvider(store, {});
    expect(configured.providerOptions).toBeUndefined();
  });

  it("uses Preview's smallest supported reasoning budget", () => {
    expect(economicalQwenProviderOptions).toEqual({
      configured: { reasoningEffort: "low" },
    });
  });

  it("disables DeepSeek thinking for reliable multi-turn tool calls", async () => {
    const store: AiSettingsReader = {
      read: async () => ({
        provider: "custom",
        apiKey: "deepseek-test-key",
        baseUrl: "https://api.deepseek.com",
        chatModel: "deepseek-v4-flash-vision-exp",
        visionModel: "deepseek-v4-flash-vision-exp",
        visionSupportsImages: true,
      }),
    };

    const configured = await createConfiguredProvider(store, {});
    expect(configured.providerOptions).toEqual(deepSeekProviderOptions);
  });
});
