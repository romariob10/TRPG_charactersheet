import {
  updateAiSettingsRequestSchema,
  updateUserRoleRequestSchema,
  type AiSettingsResponse,
} from "@mycharacter/contracts";
import {
  aiKeyHint,
  aiProviderPresets,
  inferAiProvider,
  resolveAiSettings,
  type AiSettingsWriter,
  type ResolvedAiSettings,
} from "@mycharacter/storage";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireAdmin } from "../../plugins/auth.js";
import { AuditService } from "../audit/service.js";
import { ProfileService } from "../profiles/service.js";

export async function registerAdminRoutes(
  app: FastifyInstance,
  settingsStore: AiSettingsWriter,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const profileService = new ProfileService(app.db);

  app.put("/api/admin/users/:id/role", async (request) => {
    const actor = await requireAdmin(request, app.db);
    const userId = (request.params as { id: string }).id;
    const parsed = updateUserRoleRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_FAILED",
        400,
        "Request validation failed.",
      );
    }
    return profileService.updateUserRole(actor, userId, parsed.data.role);
  });

  app.get("/api/admin/ai-settings", async (request, reply) => {
    await requireAdmin(request, app.db);
    reply.header("Cache-Control", "private, no-store");
    return settingsResponse(
      await resolveAiSettings(settingsStore, environment),
      environment,
    );
  });

  app.put("/api/admin/ai-settings", async (request) => {
    const actor = await requireAdmin(request, app.db);
    const parsed = updateAiSettingsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_FAILED",
        400,
        "Request validation failed.",
      );
    }
    const current = await resolveAiSettings(settingsStore, environment);
    const apiKey =
      parsed.data.apiKey ??
      (current?.provider === parsed.data.provider ? current.apiKey : undefined);
    if (!apiKey) {
      throw new AppError(
        "AI_API_KEY_REQUIRED",
        400,
        "An API key is required when configuring a new provider.",
      );
    }
    await settingsStore.write({ ...parsed.data, apiKey });

    await new AuditService(app.db).log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: "update_ai_settings",
      targetType: "system_settings",
      targetId: "ai",
      metadata: {
        provider: parsed.data.provider,
        baseUrl: parsed.data.baseUrl,
        chatModel: parsed.data.chatModel,
        visionModel: parsed.data.visionModel,
        hasApiKey: Boolean(apiKey),
      },
    });

    return settingsResponse(
      { ...parsed.data, apiKey, source: "admin" },
      environment,
    );
  });
}

function settingsResponse(
  settings: ResolvedAiSettings | null,
  environment: NodeJS.ProcessEnv,
): AiSettingsResponse {
  if (settings) {
    return {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      chatModel: settings.chatModel,
      visionModel: settings.visionModel,
      visionSupportsImages: settings.visionSupportsImages,
      configured: true,
      keyHint: aiKeyHint(settings.apiKey),
      source: settings.source,
    };
  }
  const baseUrl =
    nonEmpty(environment.AI_BASE_URL) ?? aiProviderPresets.qwen.baseUrl;
  const provider = inferAiProvider(baseUrl);
  const preset = aiProviderPresets[provider];
  return {
    provider,
    baseUrl,
    chatModel: nonEmpty(environment.AI_CHAT_MODEL) ?? preset.chatModel,
    visionModel:
      nonEmpty(environment.AI_VISION_MODEL) ??
      nonEmpty(environment.AI_CHAT_MODEL) ??
      preset.visionModel,
    visionSupportsImages: environment.AI_VISION_SUPPORTS_IMAGES !== "false",
    configured: false,
    keyHint: null,
    source: "none",
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
