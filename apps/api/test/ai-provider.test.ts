import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConfiguredProvider,
  economicalQwenProviderOptions,
} from "../src/modules/ai/provider.js";

describe("AI provider configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts blank optional variables from dotenv files", () => {
    vi.stubEnv(
      "AI_BASE_URL",
      "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    );
    vi.stubEnv("AI_API_KEY", "qwen-test-key");
    vi.stubEnv("AI_PRIMARY_API_KEY", "");
    vi.stubEnv("AI_CHAT_MODEL", "qwen3.8-max-preview");
    vi.stubEnv("AI_VISION_MODEL", "");
    vi.stubEnv("AI_VISION_SUPPORTS_IMAGES", "true");

    const configured = createConfiguredProvider();

    expect(configured.chatModel.modelId).toBe("qwen3.8-max-preview");
    expect(configured.visionModel.modelId).toBe("qwen3.8-max-preview");
    expect(configured.visionSupportsImages).toBe(true);
  });

  it("uses Preview's smallest supported reasoning budget", () => {
    expect(economicalQwenProviderOptions).toEqual({
      configured: { reasoningEffort: "low" },
    });
  });
});
