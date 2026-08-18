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
import { requireAdmin, requireModerator } from "../../plugins/auth.js";
import { AuditService } from "../audit/service.js";
import { ProfileService } from "../profiles/service.js";
import { sql } from "kysely";

export async function registerAdminRoutes(
  app: FastifyInstance,
  settingsStore: AiSettingsWriter,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const profileService = new ProfileService(app.db);

  app.get("/api/admin/overview", async (request, reply) => {
    const actor = await requireModerator(request);
    reply.header("Cache-Control", "private, no-store");

    const [
      userStats,
      postCount,
      characterCount,
      templateCount,
      postCommentCount,
      templateCommentCount,
      aiSettings,
      recentAuditEvents,
    ] = await Promise.all([
      app.db
        .selectFrom("users")
        .innerJoin("profiles", "profiles.id", "users.id")
        .select([
          sql<number>`count(*)::int`.as("total"),
          sql<number>`count(*) filter (where profiles.site_role = 'admin')::int`.as("admins"),
          sql<number>`count(*) filter (where profiles.site_role = 'moderator')::int`.as("moderators"),
          sql<number>`count(*) filter (where users.created_at >= now() - interval '24 hours')::int`.as("new24h"),
          sql<number>`count(*) filter (where users.created_at >= now() - interval '7 days')::int`.as("new7d"),
        ])
        .executeTakeFirst(),
      app.db
        .selectFrom("posts")
        .select(sql<number>`count(*)::int`.as("count"))
        .executeTakeFirst(),
      app.db
        .selectFrom("characters")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("status", "=", "active")
        .executeTakeFirst(),
      app.db
        .selectFrom("pdf_templates")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("deleted_at", "is", null)
        .executeTakeFirst(),
      app.db
        .selectFrom("post_comments")
        .select(sql<number>`count(*)::int`.as("count"))
        .executeTakeFirst(),
      app.db
        .selectFrom("template_comments")
        .select(sql<number>`count(*)::int`.as("count"))
        .executeTakeFirst(),
      resolveAiSettings(settingsStore, environment),
      new AuditService(app.db).list(
        { limit: 5 },
        actor.role === "moderator" ? ["post", "comment", "character", "template", "report"] : undefined,
      ),
    ]);

    return {
      users: {
        total: userStats?.total ?? 0,
        admins: userStats?.admins ?? 0,
        moderators: userStats?.moderators ?? 0,
        newLast24h: userStats?.new24h ?? 0,
        newLast7d: userStats?.new7d ?? 0,
      },
      content: {
        posts: postCount?.count ?? 0,
        characters: characterCount?.count ?? 0,
        templates: templateCount?.count ?? 0,
        comments: (postCommentCount?.count ?? 0) + (templateCommentCount?.count ?? 0),
      },
      system: {
        aiConfigured: Boolean(aiSettings?.apiKey),
        aiProvider: aiSettings?.provider ?? "none",
        nodeEnv: environment.NODE_ENV ?? "development",
      },
      recentAudit: recentAuditEvents.events.map((e) => ({
        id: e.id,
        action: e.action,
        actorRole: e.actorRole,
        actorUsername: e.actorUsername,
        targetType: e.targetType,
        createdAt: e.createdAt,
      })),
    };
  });

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
