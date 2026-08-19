import type {
  ModerateUserRequest,
  UserRestriction,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import type { Actor } from "../../plugins/auth.js";
import { AuditService } from "../audit/service.js";

export class UserModerationService {
  private readonly db: Kysely<Database>;
  private readonly audit: AuditService;

  constructor(database: Kysely<Database>) {
    this.db = database;
    this.audit = new AuditService(database);
  }

  async moderateUser(
    moderator: Actor,
    targetUserId: string,
    input: ModerateUserRequest,
  ): Promise<{ success: boolean }> {
    const target = await this.db
      .selectFrom("users")
      .innerJoin("profiles", "profiles.id", "users.id")
      .select([
        "users.id",
        "profiles.site_role as siteRole",
        "profiles.is_admin as isAdmin",
        "users.status",
      ])
      .where("users.id", "=", targetUserId)
      .executeTakeFirst();

    if (!target) {
      throw new AppError("USER_NOT_FOUND", 404, "User not found.");
    }

    const targetRole = target.siteRole ?? (target.isAdmin ? "admin" : "user");
    if (targetRole === "admin" && moderator.role !== "admin") {
      throw new AppError(
        "CANNOT_MODERATE_ADMIN",
        403,
        "Moderators cannot moderate administrators.",
      );
    }

    const expiresAt = input.durationHours
      ? new Date(Date.now() + input.durationHours * 60 * 60 * 1000)
      : null;

    await this.db
      .insertInto("user_restrictions")
      .values({
        user_id: targetUserId,
        moderator_id: moderator.userId,
        action: input.action,
        reason: input.reason,
        expires_at: expiresAt,
      })
      .execute();

    if (input.action === "ban") {
      await this.db
        .updateTable("users")
        .set({ status: "banned" })
        .where("id", "=", targetUserId)
        .execute();
      await this.db
        .deleteFrom("sessions")
        .where("user_id", "=", targetUserId)
        .execute();
    } else if (input.action === "suspend") {
      await this.db
        .updateTable("users")
        .set({ status: "suspended" })
        .where("id", "=", targetUserId)
        .execute();
      await this.db
        .deleteFrom("sessions")
        .where("user_id", "=", targetUserId)
        .execute();
    }

    await this.audit.log({
      actorId: moderator.userId,
      actorRole: moderator.role,
      action: `user_${input.action}`,
      targetType: "user",
      targetId: targetUserId,
      reason: input.reason,
      metadata: {
        action: input.action,
        durationHours: input.durationHours ?? null,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });

    return { success: true };
  }

  async unbanUser(
    moderator: Actor,
    targetUserId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    const target = await this.db
      .selectFrom("users")
      .select(["id", "status"])
      .where("id", "=", targetUserId)
      .executeTakeFirst();

    if (!target) {
      throw new AppError("USER_NOT_FOUND", 404, "User not found.");
    }

    await this.db
      .updateTable("users")
      .set({ status: "active" })
      .where("id", "=", targetUserId)
      .execute();

    await this.db
      .updateTable("user_restrictions")
      .set({
        revoked_at: new Date(),
        revoked_by: moderator.userId,
        revocation_reason: reason ?? "Unbanned by moderator",
      })
      .where("user_id", "=", targetUserId)
      .where("revoked_at", "is", null)
      .execute();

    await this.audit.log({
      actorId: moderator.userId,
      actorRole: moderator.role,
      action: "user_unban",
      targetType: "user",
      targetId: targetUserId,
      reason: reason ?? null,
      metadata: { previousStatus: target.status },
    });

    return { success: true };
  }

  async getModerationHistory(
    targetUserId: string,
  ): Promise<UserRestriction[]> {
    const rows = await this.db
      .selectFrom("user_restrictions as r")
      .leftJoin("profiles as mod", "mod.id", "r.moderator_id")
      .select([
        "r.id",
        "r.user_id as userId",
        "r.moderator_id as moderatorId",
        "mod.username as moderatorUsername",
        "r.action",
        "r.reason",
        "r.expires_at as expiresAt",
        "r.revoked_at as revokedAt",
        "r.revoked_by as revokedBy",
        "r.revocation_reason as revocationReason",
        "r.created_at as createdAt",
      ])
      .where("r.user_id", "=", targetUserId)
      .orderBy("r.created_at", "desc")
      .execute();

    return rows.map((r) => ({
      id: String(r.id),
      userId: String(r.userId),
      moderatorId: r.moderatorId ? String(r.moderatorId) : null,
      moderatorUsername: r.moderatorUsername ?? null,
      action: r.action,
      reason: r.reason,
      expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
      revokedAt: r.revokedAt ? new Date(r.revokedAt).toISOString() : null,
      revokedBy: r.revokedBy ? String(r.revokedBy) : null,
      revocationReason: r.revocationReason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async assertCanPost(userId: string): Promise<void> {
    const activeRestriction = await this.db
      .selectFrom("user_restrictions")
      .select(["id", "action", "reason"])
      .where("user_id", "=", userId)
      .where("action", "in", ["mute_posts", "suspend", "ban"])
      .where("revoked_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("expires_at", "is", null),
          eb("expires_at", ">", new Date()),
        ]),
      )
      .executeTakeFirst();

    if (activeRestriction) {
      throw new AppError(
        "USER_RESTRICTED",
        403,
        `You are restricted from publishing posts: ${activeRestriction.reason}`,
      );
    }
  }

  async assertCanComment(userId: string): Promise<void> {
    const activeRestriction = await this.db
      .selectFrom("user_restrictions")
      .select(["id", "action", "reason"])
      .where("user_id", "=", userId)
      .where("action", "in", ["mute_comments", "suspend", "ban"])
      .where("revoked_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("expires_at", "is", null),
          eb("expires_at", ">", new Date()),
        ]),
      )
      .executeTakeFirst();

    if (activeRestriction) {
      throw new AppError(
        "USER_RESTRICTED",
        403,
        `You are restricted from commenting: ${activeRestriction.reason}`,
      );
    }
  }
}
