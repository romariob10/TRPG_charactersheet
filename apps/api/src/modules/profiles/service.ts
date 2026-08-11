import type {
  MyProfile,
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
}

export class ProfileService {
  private readonly db: Kysely<Database>;

  public constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async getPublicProfile(username: string): Promise<PublicProfileResponse> {
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
      await listPublicTemplatesByOwner(this.db, profile.id)
    ).map((row) => templateSummaryFromRow(row));
    const likes = await this.db
      .selectFrom("template_likes")
      .innerJoin("pdf_templates", "pdf_templates.id", "template_likes.template_id")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("pdf_templates.owner_id", "=", profile.id)
      .where("pdf_templates.deleted_at", "is", null)
      .where("pdf_templates.visibility", "=", "private")
      .where("pdf_templates.is_public", "=", true)
      .where("pdf_templates.catalog_approved_at", "is not", null)
      .where("pdf_templates.catalog_status", "in", ["ready", "partial"])
      .executeTakeFirst();
    return {
      profile: {
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        joinedAt: profile.joinedAt.toISOString(),
        publicTemplateCount: templates.length,
        totalLikes: likes?.count ?? 0,
      },
      templates,
    };
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
}
