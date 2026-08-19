import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  aiKeyHint,
  FileAiSettingsStore,
  resolveAiSettings,
  type StoredAiSettings,
} from "../src/index.js";

const roots: string[] = [];
const settings: StoredAiSettings = {
  provider: "openrouter",
  apiKey: "secret-openrouter-key",
  baseUrl: "https://openrouter.ai/api/v1",
  chatModel: "vendor/chat-model",
  visionModel: "vendor/vision-model",
  visionSupportsImages: true,
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createStore() {
  const root = await mkdtemp(join(tmpdir(), "mycharacter-ai-settings-"));
  roots.push(root);
  return { root, store: new FileAiSettingsStore(root) };
}

describe("FileAiSettingsStore", () => {
  it("writes settings atomically with private permissions", async () => {
    const { root, store } = await createStore();
    await store.write(settings);

    await expect(store.read()).resolves.toEqual(settings);
    const path = join(root, ".secrets", "ai-provider.json");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readFile(path, "utf8")).toContain("secret-openrouter-key");
  });

  it("prefers admin settings and falls back to the primary environment key", async () => {
    const { store } = await createStore();
    const environment = {
      AI_BASE_URL: "https://api.openai.com/v1",
      AI_API_KEY: "fallback-key",
      AI_PRIMARY_API_KEY: "primary-key",
      AI_CHAT_MODEL: "chat",
      AI_VISION_MODEL: "vision",
      AI_VISION_SUPPORTS_IMAGES: "false",
    };

    await expect(resolveAiSettings(store, environment)).resolves.toMatchObject({
      provider: "openai",
      apiKey: "primary-key",
      source: "environment",
      visionSupportsImages: false,
    });
    await store.write(settings);
    await expect(resolveAiSettings(store, environment)).resolves.toMatchObject({
      provider: "openrouter",
      apiKey: "secret-openrouter-key",
      source: "admin",
    });
  });

  it("masks all but the final four key characters", () => {
    expect(aiKeyHint("secret-openrouter-key")).toBe("••••••••-key");
  });
});
