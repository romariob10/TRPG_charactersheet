import type {
  FriendSummary,
  MyProfile,
  PublicCharacterSummary,
  PublicProfile,
  SiteRole,
  TemplateSummary,
  UpdateMyProfileRequest,
  UpdateProfilePrivacyRequest,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";
import { AppError } from "../../errors.js";
import type { Actor } from "../../plugins/auth.js";
import { AuditService } from "../audit/service.js";
import { NotificationService } from "../notifications/service.js";
import {
  listPublicTemplatesByOwner,
  templateSummaryFromRow,
} from "../templates/repository.js";

export interface PublicProfileResponse {
  profile: PublicProfile;
  templates: TemplateSummary[];
  characters: PublicCharacterSummary[];
}

export class ProfileService {
  private readonly db: Kysely<Database>;

  public constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async getPublicProfile(username: string, actorId: string | null): Promise<PublicProfileResponse> {
    const profile = await this.db
      .selectFrom("profiles as profile")
      .innerJoin("users as user_row", "user_row.id", "profile.id")
      .select([
        "profile.id",
        "profile.username",
        "profile.display_name as displayName",
        "profile.bio",
        "profile.allow_comments as allowComments",
        "profile.show_characters as showCharacters",
        "profile.show_templates as showTemplates",
        "profile.show_activity as showActivity",
        "user_row.created_at as joinedAt",
      ])
      .where("profile.username", "=", username.toLowerCase())
      .where("user_row.status", "=", "active")
      .executeTakeFirst();
    if (!profile) {
      throw new AppError("PROFILE_NOT_FOUND", 404, "Profile not found.");
    }
    const templates = (
      await listPublicTemplatesByOwner(
        this.db,
        profile.id,
        actorId ?? "00000000-0000-0000-0000-000000000000",
      )
    ).map((row) => templateSummaryFromRow(row));
    const characters = await this.db
      .selectFrom("characters as character")
      .innerJoin("pdf_templates as template", "template.id", "character.template_id")
      .select([
        "character.id",
        "character.name",
        "character.slug",
        "character.updated_at as updatedAt",
        "character.published_at as publishedAt",
        "template.game_system as gameSystem",
        "template.page_count as pageCount",
        (eb) =>
          eb
            .selectFrom("character_likes")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("character_likes.character_id", "=", "character.id")
            .as("likeCount"),
        (eb) =>
          eb
            .selectFrom("character_likes")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("character_likes.character_id", "=", "character.id")
            .where("character_likes.user_id", "=", actorId ?? "00000000-0000-0000-0000-000000000000")
            .as("likedByMeCount"),
      ])
      .where("character.owner_id", "=", profile.id)
      .where("character.status", "=", "active")
      .where("character.is_public", "=", true)
      .orderBy("character.published_at", "desc")
      .execute();
    const [templateLikes, characterLikes, followerCount, followingCount, followedByMe] = await Promise.all([
      this.db
      .selectFrom("template_likes")
      .innerJoin("pdf_templates", "pdf_templates.id", "template_likes.template_id")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("pdf_templates.owner_id", "=", profile.id)
      .where("pdf_templates.deleted_at", "is", null)
      .where("pdf_templates.visibility", "=", "private")
      .where("pdf_templates.is_public", "=", true)
      .where("pdf_templates.catalog_approved_at", "is not", null)
      .where("pdf_templates.catalog_status", "in", ["ready", "partial"])
      .executeTakeFirst(),
      this.db
        .selectFrom("character_likes")
        .innerJoin("characters", "characters.id", "character_likes.character_id")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("characters.owner_id", "=", profile.id)
        .where("characters.status", "=", "active")
        .where("characters.is_public", "=", true)
        .executeTakeFirst(),
      this.db
        .selectFrom("profile_follows")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("following_id", "=", profile.id)
        .executeTakeFirst(),
      this.db
        .selectFrom("profile_follows")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("follower_id", "=", profile.id)
        .executeTakeFirst(),
      actorId
        ? this.db
            .selectFrom("profile_follows")
            .select("follower_id")
            .where("follower_id", "=", actorId)
            .where("following_id", "=", profile.id)
            .executeTakeFirst()
        : Promise.resolve(undefined),
    ]);
    const publicCharacters: PublicCharacterSummary[] = characters.map((character) => ({
      id: character.id,
      name: character.name,
      slug: character.slug,
      gameSystem: character.gameSystem,
      pageCount: character.pageCount,
      updatedAt: character.updatedAt.toISOString(),
      publishedAt: (character.publishedAt ?? character.updatedAt).toISOString(),
      author: {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
      },
      likeCount: character.likeCount,
      likedByMe: character.likedByMeCount > 0,
    }));
    const isOwner = actorId === profile.id;
    const finalTemplates = isOwner || profile.showTemplates ? templates : [];
    const finalCharacters = isOwner || profile.showCharacters ? publicCharacters : [];

    return {
      profile: {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        joinedAt: profile.joinedAt.toISOString(),
        publicTemplateCount: finalTemplates.length,
        publicCharacterCount: finalCharacters.length,
        followerCount: isOwner || profile.showActivity ? (followerCount?.count ?? 0) : 0,
        followingCount: isOwner || profile.showActivity ? (followingCount?.count ?? 0) : 0,
        followedByMe: Boolean(followedByMe),
        totalLikes: (templateLikes?.count ?? 0) + (characterLikes?.count ?? 0),
        allowComments: profile.allowComments ?? true,
        showCharacters: profile.showCharacters ?? true,
        showTemplates: profile.showTemplates ?? true,
        showActivity: profile.showActivity ?? true,
      },
      templates: finalTemplates,
      characters: finalCharacters,
    };
  }

  async follow(actorId: string, username: string): Promise<void> {
    const target = await this.requireProfileByUsername(username);
    if (target.id === actorId) {
      throw new AppError("FOLLOW_SELF", 409, "You cannot follow yourself.");
    }
    await this.db
      .insertInto("profile_follows")
      .values({ follower_id: actorId, following_id: target.id })
      .onConflict((oc) => oc.columns(["follower_id", "following_id"]).doNothing())
      .execute();

    await new NotificationService(this.db).notify({
      userId: target.id,
      actorId,
      type: "follow",
      targetType: "user",
      targetId: actorId,
      title: "New follower",
      body: "started following your profile",
    });
  }

  async unfollow(actorId: string, username: string): Promise<void> {
    const target = await this.requireProfileByUsername(username);
    await this.db
      .deleteFrom("profile_follows")
      .where("follower_id", "=", actorId)
      .where("following_id", "=", target.id)
      .execute();
  }

  async getMyProfile(actorId: string): Promise<MyProfile> {
    const profile = await this.db
      .selectFrom("profiles as profile")
      .innerJoin("users as user_row", "user_row.id", "profile.id")
      .select([
        "profile.id",
        "user_row.email",
        "profile.username",
        "profile.display_name as displayName",
        "profile.bio",
        "profile.is_admin as isAdmin",
        "profile.site_role as siteRole",
        "profile.allow_comments as allowComments",
        "profile.show_characters as showCharacters",
        "profile.show_templates as showTemplates",
        "profile.show_activity as showActivity",
      ])
      .where("profile.id", "=", actorId)
      .executeTakeFirst();
    if (!profile) {
      throw new AppError("PROFILE_NOT_FOUND", 404, "Profile not found.");
    }
    return {
      id: profile.id,
      email: profile.email,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      isAdmin: Boolean(profile.isAdmin || profile.siteRole === "admin"),
      siteRole: (profile.siteRole as SiteRole) ?? (profile.isAdmin ? "admin" : "user"),
      allowComments: profile.allowComments ?? true,
      showCharacters: profile.showCharacters ?? true,
      showTemplates: profile.showTemplates ?? true,
      showActivity: profile.showActivity ?? true,
    };
  }

  async updatePrivacySettings(
    actorId: string,
    input: UpdateProfilePrivacyRequest,
  ): Promise<MyProfile> {
    await this.db
      .updateTable("profiles")
      .set({
        ...(input.allowComments !== undefined
          ? { allow_comments: input.allowComments }
          : {}),
        ...(input.showCharacters !== undefined
          ? { show_characters: input.showCharacters }
          : {}),
        ...(input.showTemplates !== undefined
          ? { show_templates: input.showTemplates }
          : {}),
        ...(input.showActivity !== undefined
          ? { show_activity: input.showActivity }
          : {}),
        updated_at: new Date(),
      })
      .where("id", "=", actorId)
      .execute();

    return this.getMyProfile(actorId);
  }

  async updateUserRole(
    actor: Actor,
    targetUserId: string,
    newRole: SiteRole,
  ): Promise<{ id: string; siteRole: SiteRole }> {
    if (actor.role !== "admin") {
      throw new AppError("ADMIN_REQUIRED", 403, "Administrator access is required.");
    }

    const targetProfile = await this.db
      .selectFrom("profiles")
      .select(["id", "site_role as siteRole", "is_admin as isAdmin"])
      .where("id", "=", targetUserId)
      .executeTakeFirst();

    if (!targetProfile) {
      throw new AppError("USER_NOT_FOUND", 404, "User not found.");
    }

    const currentRole =
      (targetProfile.siteRole as SiteRole) ??
      (targetProfile.isAdmin ? "admin" : "user");
    if (currentRole === "admin" && newRole !== "admin") {
      const adminCount = await this.db
        .selectFrom("profiles")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("site_role", "=", "admin")
        .executeTakeFirst();
      if ((adminCount?.count ?? 0) <= 1) {
        throw new AppError(
          "LAST_ADMIN_PROTECTED",
          400,
          "Cannot demote the last administrator.",
        );
      }
    }

    await this.db
      .updateTable("profiles")
      .set({
        site_role: newRole,
        is_admin: newRole === "admin",
        updated_at: new Date(),
      })
      .where("id", "=", targetUserId)
      .execute();

    await new AuditService(this.db).log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: "update_user_role",
      targetType: "user",
      targetId: targetUserId,
      metadata: {
        previousRole: currentRole,
        newRole,
      },
    });

    return { id: targetUserId, siteRole: newRole };
  }

  async updateMyProfile(
    actorId: string,
    input: UpdateMyProfileRequest,
  ): Promise<MyProfile> {
    const current = await this.getMyProfile(actorId);
    if (input.username && input.username !== current.username) {
      const taken = await this.db
        .selectFrom("profiles")
        .select("id")
        .where("username", "=", input.username)
        .where("id", "!=", actorId)
        .executeTakeFirst();
      if (taken) {
        throw new AppError(
          "USERNAME_TAKEN",
          409,
          "This username is already taken.",
        );
      }
    }
    try {
      await this.db
        .updateTable("profiles")
        .set({
          ...(input.displayName !== undefined
            ? { display_name: input.displayName }
            : {}),
          ...(input.username !== undefined ? { username: input.username } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          updated_at: new Date(),
        })
        .where("id", "=", actorId)
        .execute();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new AppError("USERNAME_TAKEN", 409, "This username is already taken.");
      }
      throw error;
    }
    return this.getMyProfile(actorId);
  }

  async listFriends(actorId: string): Promise<FriendSummary[]> {
    const rows = await this.db
      .selectFrom("profile_follows as f1")
      .innerJoin("profile_follows as f2", (join) =>
        join
          .onRef("f2.follower_id", "=", "f1.following_id")
          .onRef("f2.following_id", "=", "f1.follower_id"),
      )
      .innerJoin("profiles as p", "p.id", "f1.following_id")
      .innerJoin("users as u", "u.id", "p.id")
      .select([
        "p.id",
        "p.username",
        "p.display_name as displayName",
      ])
      .where("f1.follower_id", "=", actorId)
      .where("u.status", "=", "active")
      .orderBy("p.username", "asc")
      .execute();
    return rows;
  }

  private async requireProfileByUsername(username: string): Promise<{ id: string }> {
    const profile = await this.db
      .selectFrom("profiles")
      .select("id")
      .where("username", "=", username.toLowerCase())
      .executeTakeFirst();
    if (!profile) {
      throw new AppError("PROFILE_NOT_FOUND", 404, "Profile not found.");
    }
    return profile;
  }
}
