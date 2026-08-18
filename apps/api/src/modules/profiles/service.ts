import type {
  MyProfile,
  PublicCharacterSummary,
  PublicProfile,
  TemplateSummary,
  UpdateMyProfileRequest,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";
import { AppError } from "../../errors.js";
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
    return {
      profile: {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        joinedAt: profile.joinedAt.toISOString(),
        publicTemplateCount: templates.length,
        publicCharacterCount: publicCharacters.length,
        followerCount: followerCount?.count ?? 0,
        followingCount: followingCount?.count ?? 0,
        followedByMe: Boolean(followedByMe),
        totalLikes: (templateLikes?.count ?? 0) + (characterLikes?.count ?? 0),
      },
      templates,
      characters: publicCharacters,
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
      isAdmin: profile.isAdmin,
    };
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
