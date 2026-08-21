import {
  commentIdSchema,
  type PublicCharacterSummary,
  type SocialFeedItem,
  type TemplateComment,
  type TemplateSummary,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { AppError } from "../../errors.js";

const DEFAULT_COMMENT_LIMIT = 20;
const MAX_COMMENT_LIMIT = 50;
const NO_ACTOR_UUID = "00000000-0000-0000-0000-000000000000";

interface PublicTemplateRow {
  id: string;
  title: string;
  slug: string;
  ownerId: string;
  gameSystem: string | null;
  pageCount: number;
  catalogStatus: "pending" | "processing" | "ready" | "partial" | "failed";
  approvedAt: Date | null;
  updatedAt: Date;
  isPublic: boolean;
  authorUsername: string;
  authorDisplayName: string | null;
  subscriberId: string | null;
  likeCount: number;
  commentCount: number;
  likedByMeCount: number | null;
}

export class SocialService {
  private readonly db: Kysely<Database>;

  public constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async listFeed(actorId: string): Promise<SocialFeedItem[]> {
    const [templates, characters] = await Promise.all([
      this.publicTemplateQuery(actorId)
        .orderBy("template.updated_at", "desc")
        .limit(60)
        .execute() as Promise<PublicTemplateRow[]>,
      this.publicCharacterQuery(actorId)
        .orderBy("character.published_at", "desc")
        .limit(60)
        .execute() as Promise<PublicCharacterRow[]>,
    ]);
    return [
      ...templates.map((row): SocialFeedItem => ({
        kind: "system",
        id: row.id,
        slug: row.slug,
        title: row.title,
        gameSystem: row.gameSystem,
        pageCount: row.pageCount,
        publishedAt: (row.approvedAt ?? row.updatedAt).toISOString(),
        author: {
          id: row.ownerId,
          username: row.authorUsername,
          displayName: row.authorDisplayName,
        },
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        likedByMe: (row.likedByMeCount ?? 0) > 0,
        remixedByMe: row.ownerId === actorId || Boolean(row.subscriberId),
      })),
      ...characters.map((row): SocialFeedItem => ({
        kind: "character",
        id: row.id,
        slug: row.slug,
        title: row.name,
        gameSystem: row.gameSystem,
        pageCount: row.pageCount,
        publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
        author: {
          id: row.ownerId,
          username: row.authorUsername,
          displayName: row.authorDisplayName,
        },
        likeCount: row.likeCount,
        commentCount: 0,
        likedByMe: row.likedByMeCount > 0,
        remixedByMe: row.remixCount > 0,
      })),
    ]
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, 80);
  }

  async likeCharacter(actorId: string, characterId: string): Promise<void> {
    await this.requirePublicCharacter(characterId);
    await this.db
      .insertInto("character_likes")
      .values({ user_id: actorId, character_id: characterId })
      .onConflict((oc) => oc.columns(["user_id", "character_id"]).doNothing())
      .execute();
  }

  async unlikeCharacter(actorId: string, characterId: string): Promise<void> {
    await this.requirePublicCharacter(characterId);
    await this.db
      .deleteFrom("character_likes")
      .where("user_id", "=", actorId)
      .where("character_id", "=", characterId)
      .execute();
  }

  async getPublicCharacter(
    actorId: string | null,
    username: string,
    slug: string,
  ): Promise<PublicCharacterSummary> {
    const row = (await this.publicCharacterQuery(actorId)
      .where("author.username", "=", username.toLowerCase())
      .where("character.slug", "=", slug)
      .executeTakeFirst()) as PublicCharacterRow | undefined;
    if (!row) {
      throw new AppError("CHARACTER_NOT_FOUND", 404, "Character not found.");
    }
    return toPublicCharacter(row);
  }

  async remixCharacter(actorId: string, characterId: string): Promise<{ id: string }> {
    const source = await this.requirePublicCharacter(characterId);
    const id = await this.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto("characters")
        .values({
          template_id: source.templateId,
          owner_id: actorId,
          name: `${source.name} — remix`,
          remix_source_id: source.id,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("character_values")
        .columns(["character_id", "field_id", "value", "version", "updated_by"])
        .expression((eb) =>
          eb
            .selectFrom("character_values")
            .select([
              eb.val(created.id).as("character_id"),
              "field_id",
              "value",
              eb.val(0).as("version"),
              eb.val(actorId).as("updated_by"),
            ])
            .where("character_id", "=", characterId),
        )
        .execute();
      return created.id;
    });
    return { id };
  }

  async like(actorId: string, templateId: string): Promise<void> {
    await this.requirePublicTemplate(templateId);
    await this.db
      .insertInto("template_likes")
      .values({ user_id: actorId, template_id: templateId })
      .onConflict((oc) => oc.columns(["user_id", "template_id"]).doNothing())
      .execute();
  }

  async unlike(actorId: string, templateId: string): Promise<void> {
    await this.requirePublicTemplate(templateId);
    await this.db
      .deleteFrom("template_likes")
      .where("user_id", "=", actorId)
      .where("template_id", "=", templateId)
      .execute();
  }

  async listComments(
    templateId: string,
    cursor: string | undefined,
    limitInput: number | undefined,
  ): Promise<{ items: TemplateComment[]; nextCursor: string | null }> {
    await this.requirePublicTemplate(templateId);
    const limit = Math.min(
      Math.max(limitInput ?? DEFAULT_COMMENT_LIMIT, 1),
      MAX_COMMENT_LIMIT,
    );
    const position = cursor ? decodeCursor(cursor) : null;
    let query = this.db
      .selectFrom("template_comments as comment")
      .innerJoin("profiles as author", "author.id", "comment.author_id")
      .select([
        "comment.id",
        "comment.template_id as templateId",
        "comment.body",
        "comment.created_at as createdAt",
        "comment.updated_at as updatedAt",
        "author.id as authorId",
        "author.username as authorUsername",
        "author.display_name as authorDisplayName",
        sql<string>`comment.created_at::text`.as("createdAtText"),
      ])
      .where("comment.template_id", "=", templateId)
      .orderBy("comment.created_at", "desc")
      .orderBy("comment.id", "desc")
      .limit(limit + 1);
    if (position) {
      const cursorTimestamp = sql<Date>`${position.createdAtText}::timestamptz`;
      query = query.where((eb) =>
        eb.or([
          eb("comment.created_at", "<", cursorTimestamp),
          eb.and([
            eb("comment.created_at", "=", cursorTimestamp),
            eb("comment.id", "<", position.id),
          ]),
        ]),
      );
    }
    const rows = await query.execute();
    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => toComment(row));
    const nextCursor =
      rows.length > limit && pageRows.length
        ? encodeCursor(pageRows[pageRows.length - 1])
        : null;
    return { items, nextCursor };
  }

  async addComment(
    actorId: string,
    templateId: string,
    body: string,
  ): Promise<TemplateComment> {
    await this.requirePublicTemplate(templateId);
    const row = await this.db
      .insertInto("template_comments")
      .values({ template_id: templateId, author_id: actorId, body })
      .returning([
        "id",
        "template_id as templateId",
        "body",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .executeTakeFirstOrThrow();
    const author = await this.db
      .selectFrom("profiles")
      .select(["id", "username", "display_name as displayName"])
      .where("id", "=", actorId)
      .executeTakeFirstOrThrow();
    return {
      id: row.id,
      templateId: row.templateId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
      },
    };
  }

  async deleteComment(
    actorId: string,
    templateId: string,
    commentId: string,
  ): Promise<void> {
    await this.requirePublicTemplate(templateId);
    const comment = await this.db
      .selectFrom("template_comments as comment")
      .leftJoin("profiles as actor_profile", (join) =>
        join.on("actor_profile.id", "=", actorId),
      )
      .select(["comment.author_id as authorId", "actor_profile.is_admin as actorIsAdmin"])
      .where("comment.id", "=", commentId)
      .where("comment.template_id", "=", templateId)
      .executeTakeFirst();
    if (!comment) {
      throw new AppError("COMMENT_NOT_FOUND", 404, "Comment not found.");
    }
    if (comment.authorId !== actorId && !comment.actorIsAdmin) {
      throw new AppError("COMMENT_FORBIDDEN", 403, "You cannot delete this comment.");
    }
    await this.db
      .deleteFrom("template_comments")
      .where("id", "=", commentId)
      .execute();
  }

  async getCommunityDetails(
    actorId: string | null,
    username: string,
    slug: string,
  ): Promise<{ template: TemplateSummary }> {
    const row = (await this.publicTemplateQuery(actorId)
      .where("author.username", "=", username.toLowerCase())
      .where("template.slug", "=", slug)
      .executeTakeFirst()) as PublicTemplateRow | undefined;
    if (!row) {
      throw new AppError("TEMPLATE_NOT_FOUND", 404, "Template not found.");
    }
    return { template: toSummary(row) };
  }

  private async requirePublicTemplate(templateId: string): Promise<void> {
    const row = await this.publicTemplateQuery(null)
      .where("template.id", "=", templateId)
      .select("template.id")
      .executeTakeFirst();
    if (!row) {
      throw new AppError("TEMPLATE_NOT_FOUND", 404, "Template not found.");
    }
  }

  private async requirePublicCharacter(characterId: string): Promise<PublicCharacterRow> {
    const row = (await this.publicCharacterQuery(null)
      .where("character.id", "=", characterId)
      .executeTakeFirst()) as PublicCharacterRow | undefined;
    if (!row) {
      throw new AppError("CHARACTER_NOT_FOUND", 404, "Character not found.");
    }
    return row;
  }

  private publicCharacterQuery(actorId: string | null) {
    const joinActorId = actorId ?? NO_ACTOR_UUID;
    return this.db
      .selectFrom("characters as character")
      .innerJoin("profiles as author", "author.id", "character.owner_id")
      .innerJoin("pdf_templates as template", "template.id", "character.template_id")
      .select([
        "character.id",
        "character.template_id as templateId",
        "character.owner_id as ownerId",
        "character.name",
        "character.slug",
        "character.updated_at as updatedAt",
        "character.published_at as publishedAt",
        "template.game_system as gameSystem",
        "template.page_count as pageCount",
        "author.username as authorUsername",
        "author.display_name as authorDisplayName",
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
            .where("character_likes.user_id", "=", joinActorId)
            .as("likedByMeCount"),
        (eb) =>
          eb
            .selectFrom("characters as remix")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("remix.remix_source_id", "=", "character.id")
            .where("remix.owner_id", "=", joinActorId)
            .where("remix.status", "=", "active")
            .as("remixCount"),
      ])
      .where("character.status", "=", "active")
      .where("character.is_public", "=", true);
  }

  private publicTemplateQuery(actorId: string | null) {
    const joinActorId = actorId ?? NO_ACTOR_UUID;
    return this.db
      .selectFrom("pdf_templates as template")
      .innerJoin("profiles as author", "author.id", "template.owner_id")
      .leftJoin("template_subscriptions as subscription", (join) =>
        join
          .onRef("subscription.template_id", "=", "template.id")
          .on("subscription.user_id", "=", joinActorId),
      )
      .select([
        "template.id",
        "template.title",
        "template.slug",
        "template.owner_id as ownerId",
        "template.game_system as gameSystem",
        "template.page_count as pageCount",
        "template.catalog_status as catalogStatus",
        "template.catalog_approved_at as approvedAt",
        "template.updated_at as updatedAt",
        "template.is_public as isPublic",
        "author.username as authorUsername",
        "author.display_name as authorDisplayName",
        "subscription.user_id as subscriberId",
        (eb) =>
          eb
            .selectFrom("template_likes")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("template_likes.template_id", "=", "template.id")
            .as("likeCount"),
        (eb) =>
          eb
            .selectFrom("template_comments")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("template_comments.template_id", "=", "template.id")
            .as("commentCount"),
        (eb) =>
          eb
            .selectFrom("template_likes")
            .select(sql<number | null>`count(*)::int`.as("count"))
            .whereRef("template_likes.template_id", "=", "template.id")
            .where("template_likes.user_id", "=", joinActorId)
            .as("likedByMeCount"),
      ])
      .where("template.deleted_at", "is", null)
      .where("template.visibility", "=", "private")
      .where("template.is_public", "=", true)
      .where("template.catalog_approved_at", "is not", null)
      .where("template.catalog_status", "in", ["ready", "partial"]);
  }
}

interface PublicCharacterRow {
  id: string;
  templateId: string;
  ownerId: string;
  name: string;
  slug: string;
  updatedAt: Date;
  publishedAt: Date | null;
  gameSystem: string | null;
  pageCount: number;
  authorUsername: string;
  authorDisplayName: string | null;
  likeCount: number;
  likedByMeCount: number;
  remixCount: number;
}

function toPublicCharacter(row: PublicCharacterRow): PublicCharacterSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    gameSystem: row.gameSystem,
    pageCount: row.pageCount,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
    author: {
      id: row.ownerId,
      username: row.authorUsername,
      displayName: row.authorDisplayName,
    },
    likeCount: row.likeCount,
    likedByMe: row.likedByMeCount > 0,
  };
}

function toSummary(row: PublicTemplateRow): TemplateSummary {
  return {
    id: row.id,
    title: row.title,
    gameSystem: row.gameSystem,
    pageCount: row.pageCount,
    catalogStatus: row.catalogStatus,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    isPublic: row.isPublic,
    slug: row.slug,
    author: {
      id: row.ownerId,
      username: row.authorUsername,
      displayName: row.authorDisplayName,
    },
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    likedByMe: (row.likedByMeCount ?? 0) > 0,
    ...(row.subscriberId ? { subscribed: true } : {}),
  };
}

interface CommentRow {
  id: string;
  templateId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  createdAtText: string;
}

function toComment(row: CommentRow): TemplateComment {
  return {
    id: row.id,
    templateId: row.templateId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.authorId,
      username: row.authorUsername,
      displayName: row.authorDisplayName,
    },
  };
}

function encodeCursor(row: CommentRow): string {
  return Buffer.from(`${row.createdAtText}|${row.id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): { createdAtText: string; id: string } {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    const createdAtText = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    if (
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?)?$/.test(
        createdAtText,
      ) ||
      Number.isNaN(Date.parse(createdAtText)) ||
      !commentIdSchema.safeParse(id).success
    ) {
      throw new Error("Invalid cursor.");
    }
    return { createdAtText, id };
  } catch {
    throw new AppError("INVALID_CURSOR", 400, "Pagination cursor is invalid.");
  }
}
