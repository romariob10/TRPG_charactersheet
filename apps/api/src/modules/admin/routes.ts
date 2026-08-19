import {
  analyticsPeriodSchema,
  listAdminUsersQuerySchema,
  moderateUserRequestSchema,
  unbanUserRequestSchema,
  updateAiSettingsRequestSchema,
  updateUserRoleRequestSchema,
  type AdminUserSummary,
  type AiSettingsResponse,
  type SiteRole,
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
import { AnalyticsService } from "./analytics-service.js";
import { AuditService } from "../audit/service.js";
import { UserModerationService } from "../moderation/user-moderation-service.js";
import { PostService } from "../posts/service.js";
import { ProfileService } from "../profiles/service.js";
import { sql } from "kysely";

function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const name = parts[0];
  const domain = parts[1];
  const maskedName =
    name.length <= 2 ? `${name[0]}*` : `${name[0]}***${name[name.length - 1]}`;
  return `${maskedName}@${domain}`;
}

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
      recentAudit: recentAuditEvents.events.map((evt) => ({
        id: evt.id,
        actorUsername: evt.actorUsername,
        actorRole: evt.actorRole,
        action: evt.action,
        targetType: evt.targetType,
        createdAt: evt.createdAt,
      })),
    };
  });

  const analyticsService = new AnalyticsService(app.db);

  app.get("/api/admin/analytics", async (request, reply) => {
    await requireModerator(request);
    reply.header("Cache-Control", "private, no-store");
    const rawPeriod = (request.query as { period?: unknown })?.period;
    const parsed = analyticsPeriodSchema.safeParse(rawPeriod ?? "30d");
    return analyticsService.getSummary(parsed.success ? parsed.data : "30d");
  });

  app.get("/api/admin/users", async (request, reply) => {
    const actor = await requireModerator(request);
    reply.header("Cache-Control", "private, no-store");

    const query = listAdminUsersQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid query parameters.");
    }

    const limit = Math.min(Math.max(query.data.limit ?? 50, 1), 100);

    let baseQuery = app.db
      .selectFrom("users")
      .innerJoin("profiles", "profiles.id", "users.id")
      .select([
        "users.id",
        "profiles.username",
        "profiles.display_name as displayName",
        "users.email",
        "users.status",
        "profiles.site_role as siteRole",
        "profiles.is_admin as isAdmin",
        "users.created_at as joinedAt",
        (eb) =>
          eb
            .selectFrom("sessions")
            .select("sessions.last_used_at")
            .whereRef("sessions.user_id", "=", "users.id")
            .orderBy("sessions.last_used_at", "desc")
            .limit(1)
            .as("lastUsedAt"),
        (eb) =>
          eb
            .selectFrom("posts")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("posts.author_id", "=", "users.id")
            .as("postsCount"),
        (eb) =>
          eb
            .selectFrom("characters")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("characters.owner_id", "=", "users.id")
            .where("characters.status", "=", "active")
            .as("charactersCount"),
        (eb) =>
          eb
            .selectFrom("pdf_templates")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("pdf_templates.owner_id", "=", "users.id")
            .where("pdf_templates.deleted_at", "is", null)
            .as("templatesCount"),
      ])
      .orderBy("users.created_at", "desc")
      .limit(limit + 1);

    if (query.data.search) {
      const s = `%${query.data.search.trim().toLowerCase()}%`;
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb(sql`lower(profiles.username)`, "like", s),
          eb(sql`lower(profiles.display_name)`, "like", s),
          eb(sql`lower(users.email)`, "like", s),
        ]),
      );
    }

    if (query.data.role) {
      baseQuery = baseQuery.where("profiles.site_role", "=", query.data.role);
    }

    if (query.data.cursor) {
      baseQuery = baseQuery.where(
        "users.created_at",
        "<",
        new Date(query.data.cursor),
      );
    }

    const [rows, totalResult] = await Promise.all([
      baseQuery.execute(),
      app.db
        .selectFrom("users")
        .innerJoin("profiles", "profiles.id", "users.id")
        .select(sql<number>`count(*)::int`.as("count"))
        .executeTakeFirst(),
    ]);

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasNext && items.length > 0
        ? items[items.length - 1].joinedAt.toISOString()
        : null;

    const users: AdminUserSummary[] = items.map((row) => ({
      id: String(row.id),
      username: row.username,
      displayName: row.displayName,
      email: actor.role === "admin" ? row.email : maskEmail(row.email),
      siteRole:
        (row.siteRole as SiteRole) ?? (row.isAdmin ? "admin" : "user"),
      status: row.status,
      joinedAt: row.joinedAt.toISOString(),
      lastUsedAt: row.lastUsedAt
        ? new Date(row.lastUsedAt).toISOString()
        : null,
      postsCount: row.postsCount ?? 0,
      charactersCount: row.charactersCount ?? 0,
      templatesCount: row.templatesCount ?? 0,
    }));

    return {
      users,
      nextCursor,
      total: totalResult?.count ?? 0,
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

  app.post("/api/admin/users/:id/revoke-sessions", async (request) => {
    const actor = await requireAdmin(request, app.db);
    const targetUserId = (request.params as { id: string }).id;

    await app.db
      .deleteFrom("sessions")
      .where("user_id", "=", targetUserId)
      .execute();

    await new AuditService(app.db).log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: "revoke_user_sessions",
      targetType: "user",
      targetId: targetUserId,
      metadata: { targetUserId },
    });

    return { success: true };
  });

  const userModerationService = new UserModerationService(app.db);

  app.post("/api/admin/users/:id/moderate", async (request) => {
    const actor = await requireModerator(request);
    const targetUserId = (request.params as { id: string }).id;
    const parsed = moderateUserRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_FAILED",
        400,
        "Invalid moderation parameters.",
      );
    }
    return userModerationService.moderateUser(
      actor,
      targetUserId,
      parsed.data,
    );
  });

  app.post("/api/admin/users/:id/unban", async (request) => {
    const actor = await requireModerator(request);
    const targetUserId = (request.params as { id: string }).id;
    const parsed = unbanUserRequestSchema.safeParse(request.body ?? {});
    return userModerationService.unbanUser(
      actor,
      targetUserId,
      parsed.success ? parsed.data.reason : undefined,
    );
  });

  app.get(
    "/api/admin/users/:id/moderation-history",
    async (request, reply) => {
      await requireModerator(request);
      reply.header("Cache-Control", "private, no-store");
      const targetUserId = (request.params as { id: string }).id;
      return userModerationService.getModerationHistory(targetUserId);
    },
  );

  const postService = new PostService(app.db);

  app.put("/api/admin/posts/:id/visibility", async (request) => {
    const actor = await requireModerator(request);
    const postId = (request.params as { id: string }).id;
    const body =
      (request.body as { isHidden?: boolean; reason?: string }) ?? {};
    if (typeof body.isHidden !== "boolean") {
      throw new AppError(
        "VALIDATION_FAILED",
        400,
        "isHidden boolean is required.",
      );
    }
    await postService.adminSetPostVisibility(
      actor.userId,
      actor.role,
      postId,
      body.isHidden,
      body.reason,
    );
    return { success: true, isHidden: body.isHidden };
  });

  app.post("/api/admin/posts/:id/restore", async (request) => {
    const actor = await requireModerator(request);
    const postId = (request.params as { id: string }).id;
    const body = (request.body as { reason?: string }) ?? {};
    await postService.adminRestorePost(
      actor.userId,
      actor.role,
      postId,
      body.reason,
    );
    return { success: true };
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
