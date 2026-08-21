import { constants } from "node:fs";
import {
  chmod,
  mkdir,
  open as openFile,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type AiProviderName = "qwen" | "openai" | "openrouter" | "custom";

export interface StoredAiSettings {
  provider: AiProviderName;
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  visionModel: string;
  visionSupportsImages: boolean;
}

export interface ResolvedAiSettings extends StoredAiSettings {
  source: "admin" | "environment";
}

export interface AiSettingsReader {
  read(): Promise<StoredAiSettings | null>;
}

export interface AiSettingsWriter extends AiSettingsReader {
  write(_settings: StoredAiSettings): Promise<void>;
}

const defaultQwenBaseUrl =
  "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

export const aiProviderPresets = {
  qwen: {
    baseUrl: defaultQwenBaseUrl,
    chatModel: "qwen3.8-max-preview",
    visionModel: "qwen3.8-max-preview",
    visionSupportsImages: true,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4.1-mini",
    visionModel: "gpt-4.1-mini",
    visionSupportsImages: true,
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    chatModel: "openai/gpt-4.1-mini",
    visionModel: "openai/gpt-4.1-mini",
    visionSupportsImages: true,
  },
  custom: {
    baseUrl: "",
    chatModel: "",
    visionModel: "",
    visionSupportsImages: true,
  },
} as const satisfies Record<
  AiProviderName,
  Omit<StoredAiSettings, "provider" | "apiKey">
>;

export class FileAiSettingsStore implements AiSettingsWriter {
  private readonly directory: string;
  private readonly path: string;

  public constructor(storageRoot: string) {
    if (!isAbsolute(storageRoot)) {
      throw new Error("AI settings storage root must be absolute.");
    }
    this.directory = join(resolve(storageRoot), ".secrets");
    this.path = join(this.directory, "ai-provider.json");
  }

  async read(): Promise<StoredAiSettings | null> {
    try {
      const contents = await readFile(this.path, "utf8");
      return parseStoredAiSettings(JSON.parse(contents) as unknown);
    } catch (error) {
      if (nodeCode(error) === "ENOENT") return null;
      throw error;
    }
  }

  async write(settings: StoredAiSettings): Promise<void> {
    const validated = parseStoredAiSettings(settings);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const partial = join(
      this.directory,
      `.ai-provider-${randomUUID()}.partial`,
    );
    let handle: Awaited<ReturnType<typeof openFile>> | undefined;
    try {
      handle = await openFile(
        partial,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(`${JSON.stringify(validated)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(partial, this.path);
      await chmod(this.path, 0o600);
      const directory = await openFile(this.directory, constants.O_RDONLY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await unlink(partial).catch(() => undefined);
      throw error;
    }
  }
}

export async function resolveAiSettings(
  store: AiSettingsReader,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedAiSettings | null> {
  const stored = await store.read();
  if (stored) return { ...stored, source: "admin" };

  const apiKey =
    nonEmpty(environment.AI_PRIMARY_API_KEY) ??
    nonEmpty(environment.AI_API_KEY);
  const baseUrl = nonEmpty(environment.AI_BASE_URL);
  const chatModel = nonEmpty(environment.AI_CHAT_MODEL);
  if (!apiKey || !baseUrl || !chatModel) return null;

  return {
    provider: inferAiProvider(baseUrl),
    apiKey,
    baseUrl: validUrl(baseUrl),
    chatModel,
    visionModel: nonEmpty(environment.AI_VISION_MODEL) ?? chatModel,
    visionSupportsImages: environment.AI_VISION_SUPPORTS_IMAGES !== "false",
    source: "environment",
  };
}

export function inferAiProvider(baseUrl: string): AiProviderName {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (hostname === "api.openai.com") return "openai";
    if (hostname === "openrouter.ai") return "openrouter";
    if (
      hostname.endsWith("aliyuncs.com") ||
      hostname.endsWith("dashscope.com")
    ) {
      return "qwen";
    }
  } catch {
    return "custom";
  }
  return "custom";
}

export function aiKeyHint(apiKey: string): string {
  const suffix = apiKey.slice(-4);
  return `••••••••${suffix}`;
}

function parseStoredAiSettings(value: unknown): StoredAiSettings {
  if (!value || typeof value !== "object") throw invalidSettings();
  const input = value as Record<string, unknown>;
  const provider = input.provider;
  if (
    provider !== "qwen" &&
    provider !== "openai" &&
    provider !== "openrouter" &&
    provider !== "custom"
  ) {
    throw invalidSettings();
  }
  const apiKey = requiredString(input.apiKey, 512);
  const baseUrl = validUrl(requiredString(input.baseUrl, 500));
  const chatModel = requiredString(input.chatModel, 200);
  const visionModel = requiredString(input.visionModel, 200);
  if (typeof input.visionSupportsImages !== "boolean") throw invalidSettings();
  return {
    provider,
    apiKey,
    baseUrl,
    chatModel,
    visionModel,
    visionSupportsImages: input.visionSupportsImages,
  };
}

function requiredString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw invalidSettings();
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw invalidSettings();
  return normalized;
}

function validUrl(value: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw invalidSettings();
  }
}

function invalidSettings(): Error {
  return new Error("Stored AI provider settings are invalid.");
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function nodeCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}
