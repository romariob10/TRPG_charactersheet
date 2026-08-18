import { randomUUID } from "node:crypto";
import {
  createPostRequestSchema,
  type PostBlock,
  type PostComment,
  type PostEmbed,
  type PostReaction,
  type PostReactionSummary,
  type SocialPost,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { AppError } from "../../errors.js";

const NO_ACTOR_UUID = "00000000-0000-0000-0000-000000000000";
const REACTIONS = ["like", "fire", "dice"] as const;

interface PostRow {
  id: string;
  slug: string;
  title: string | null;
  content: unknown;
  plainText: string;
  publishedAt: Date;
  updatedAt: Date;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  commentCount: number;
}

export class PostService {
  private readonly db: Kysely<Database>;

  public constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async create(actorId: string, blocks: PostBlock[]): Promise<SocialPost> {
    const normalized = normalizeBlocks(blocks);
    const plainText = blocksToPlainText(normalized);
    if (!plainText) {
      throw new AppError("POST_EMPTY", 400, "Post content cannot be empty.");
    }
    const title = postTitle(normalized);
    const postId = randomUUID();
    const slug = postSlug(title, postId);
    const imageIds = uniqueIds(
      normalized.flatMap((block) =>
        block.type === "image" ? [block.data.fileId] : [],
      ),
    );
    await this.assertEmbedsArePublic(normalized);
    await this.assertImagesBelongTo(actorId, imageIds);

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("posts")
        .values({
          id: postId,
          author_id: actorId,
          slug,
          title,
          // node-postgres serializes bare arrays as PostgreSQL arrays. JSON text
          // makes the intended jsonb value unambiguous and is parsed on read.
          content: JSON.stringify(normalized),
          plain_text: plainText,
        })
        .execute();
      if (imageIds.length) {
        await trx
          .updateTable("post_images")
          .set({ post_id: postId })
          .where("uploader_id", "=", actorId)
          .where("post_id", "is", null)
          .where("file_id", "in", imageIds)
          .execute();
      }
    });
    return this.getById(postId, actorId);
  }

  async listEmbedOptions(actorId: string) {
    const [characters, systems] = await Promise.all([
      this.db
        .selectFrom("characters as character")
        .innerJoin(
          "pdf_templates as template",
          "template.id",
          "character.template_id",
        )
        .select([
          "character.id",
          "character.name as title",
          "template.game_system as gameSystem",
        ])
        .where("character.owner_id", "=", actorId)
        .where("character.status", "=", "active")
        .where("character.is_public", "=", true)
        .orderBy("character.updated_at", "desc")
        .execute(),
      this.db
        .selectFrom("pdf_templates")
        .select(["id", "title", "game_system as gameSystem"])
        .where("owner_id", "=", actorId)
        .where("deleted_at", "is", null)
        .where("is_public", "=", true)
        .where("catalog_approved_at", "is not", null)
        .where("catalog_status", "in", ["ready", "partial"])
        .orderBy("updated_at", "desc")
        .execute(),
    ]);
    return { characters, systems };
  }

  async list(actorId: string, limit = 30): Promise<SocialPost[]> {
    const rows = await this.basePostQuery()
      .orderBy("post.published_at", "desc")
      .limit(Math.min(Math.max(limit, 1), 50))
      .execute();
    return this.hydrate(rows, actorId);
  }

  async getPublic(
    username: string,
    slug: string,
    actorId: string | null,
  ): Promise<SocialPost> {
    const row = await this.basePostQuery()
      .where("author.username", "=", username.toLowerCase())
      .where("post.slug", "=", slug)
      .executeTakeFirst();
    if (!row) throw postNotFound();
    return (await this.hydrate([row], actorId))[0];
  }

  async getById(postId: string, actorId: string | null): Promise<SocialPost> {
    const row = await this.basePostQuery()
      .where("post.id", "=", postId)
      .executeTakeFirst();
    if (!row) throw postNotFound();
    return (await this.hydrate([row], actorId))[0];
  }

  async addReaction(
    actorId: string,
    postId: string,
    reaction: PostReaction,
  ): Promise<PostReactionSummary[]> {
    await this.requirePost(postId);
    await this.db
      .insertInto("post_reactions")
      .values({ user_id: actorId, post_id: postId, reaction })
      .onConflict((conflict) =>
        conflict.columns(["user_id", "post_id", "reaction"]).doNothing(),
      )
      .execute();
    return this.reactionsFor([postId], actorId).then((items) =>
      items.get(postId)!,
    );
  }

  async removeReaction(
    actorId: string,
    postId: string,
    reaction: PostReaction,
  ): Promise<PostReactionSummary[]> {
    await this.requirePost(postId);
    await this.db
      .deleteFrom("post_reactions")
      .where("user_id", "=", actorId)
      .where("post_id", "=", postId)
      .where("reaction", "=", reaction)
      .execute();
    return this.reactionsFor([postId], actorId).then((items) =>
      items.get(postId)!,
    );
  }

  async listComments(postId: string): Promise<PostComment[]> {
    await this.requirePost(postId);
    const rows = await this.db
      .selectFrom("post_comments as comment")
      .innerJoin("profiles as author", "author.id", "comment.author_id")
      .select([
        "comment.id",
        "comment.post_id as postId",
        "comment.body",
        "comment.created_at as createdAt",
        "comment.updated_at as updatedAt",
        "author.id as authorId",
        "author.username as authorUsername",
        "author.display_name as authorDisplayName",
      ])
      .where("comment.post_id", "=", postId)
      .orderBy("comment.created_at", "asc")
      .limit(100)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      postId: row.postId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.authorId,
        username: row.authorUsername,
        displayName: row.authorDisplayName,
      },
    }));
  }

  async addComment(
    actorId: string,
    postId: string,
    body: string,
  ): Promise<PostComment> {
    await this.requirePost(postId);
    const comment = await this.db
      .insertInto("post_comments")
      .values({ post_id: postId, author_id: actorId, body: body.trim() })
      .returning("id")
      .executeTakeFirstOrThrow();
    const comments = await this.listComments(postId);
    return comments.find((item) => item.id === comment.id)!;
  }

  async deleteComment(actorId: string, commentId: string): Promise<void> {
    const row = await this.db
      .selectFrom("post_comments as comment")
      .innerJoin("profiles as actor", (join) =>
        join.on("actor.id", "=", actorId),
      )
      .select([
        "comment.author_id as authorId",
        "actor.is_admin as actorIsAdmin",
      ])
      .where("comment.id", "=", commentId)
      .executeTakeFirst();
    if (!row)
      throw new AppError("COMMENT_NOT_FOUND", 404, "Comment not found.");
    if (row.authorId !== actorId && !row.actorIsAdmin) {
      throw new AppError(
        "COMMENT_FORBIDDEN",
        403,
        "You cannot delete this comment.",
      );
    }
    await this.db
      .deleteFrom("post_comments")
      .where("id", "=", commentId)
      .execute();
  }

  private basePostQuery() {
    return this.db
      .selectFrom("posts as post")
      .innerJoin("profiles as author", "author.id", "post.author_id")
      .innerJoin("users as author_user", "author_user.id", "post.author_id")
      .select([
        "post.id",
        "post.slug",
        "post.title",
        "post.content",
        "post.plain_text as plainText",
        "post.published_at as publishedAt",
        "post.updated_at as updatedAt",
        "author.id as authorId",
        "author.username as authorUsername",
        "author.display_name as authorDisplayName",
        (eb) =>
          eb
            .selectFrom("post_comments")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("post_comments.post_id", "=", "post.id")
            .as("commentCount"),
      ])
      .where("author_user.status", "=", "active");
  }

  private async hydrate(
    rows: PostRow[],
    actorId: string | null,
  ): Promise<SocialPost[]> {
    if (!rows.length) return [];
    const parsed = rows.map((row) => ({
      row,
      blocks: createPostRequestSchema.shape.blocks.parse(row.content),
    }));
    const [reactions, embeds] = await Promise.all([
      this.reactionsFor(
        rows.map((row) => row.id),
        actorId,
      ),
      this.embedsFor(
        parsed.flatMap((item) => item.blocks),
        actorId,
      ),
    ]);
    return parsed.map(({ row, blocks }) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      blocks,
      plainTextLength: row.plainText.length,
      isLong: row.plainText.length > 600 || blocks.length > 5,
      isArticle: row.plainText.length > 2_000 || blocks.length > 12,
      publishedAt: row.publishedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.authorId,
        username: row.authorUsername,
        displayName: row.authorDisplayName,
      },
      reactions: reactions.get(row.id)!,
      commentCount: row.commentCount,
      embeds: embedListForBlocks(blocks, embeds),
    }));
  }

  private async reactionsFor(
    postIds: string[],
    actorId: string | null,
  ): Promise<Map<string, PostReactionSummary[]>> {
    const result = new Map(
      postIds.map((id) => [
        id,
        REACTIONS.map((reaction) => ({
          reaction,
          count: 0,
          reactedByMe: false,
        })),
      ]),
    );
    if (!postIds.length) return result;
    const rows = await this.db
      .selectFrom("post_reactions")
      .select([
        "post_id as postId",
        "reaction",
        sql<number>`count(*)::int`.as("count"),
        sql<number>`count(*) filter (where user_id = ${actorId ?? NO_ACTOR_UUID})::int`.as(
          "mine",
        ),
      ])
      .where("post_id", "in", postIds)
      .groupBy(["post_id", "reaction"])
      .execute();
    for (const row of rows) {
      const summary = result
        .get(row.postId)
        ?.find((item) => item.reaction === row.reaction);
      if (summary) {
        summary.count = row.count;
        summary.reactedByMe = row.mine > 0;
      }
    }
    return result;
  }

  private async embedsFor(
    blocks: PostBlock[],
    actorId: string | null,
  ): Promise<Map<string, PostEmbed>> {
    const characterIds = uniqueIds(
      blocks.flatMap((block) =>
        block.type === "character" ? [block.data.characterId] : [],
      ),
    );
    const templateIds = uniqueIds(
      blocks.flatMap((block) =>
        block.type === "system" ? [block.data.templateId] : [],
      ),
    );
    const joinActorId = actorId ?? NO_ACTOR_UUID;
    const [characters, templates] = await Promise.all([
      characterIds.length
        ? this.db
            .selectFrom("characters as character")
            .innerJoin("profiles as author", "author.id", "character.owner_id")
            .innerJoin(
              "pdf_templates as template",
              "template.id",
              "character.template_id",
            )
            .select([
              "character.id",
              "character.name as title",
              "character.slug",
              "template.game_system as gameSystem",
              "template.page_count as pageCount",
              "author.id as authorId",
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
                  .as("remixedByMeCount"),
            ])
            .where("character.id", "in", characterIds)
            .where("character.status", "=", "active")
            .where("character.is_public", "=", true)
            .execute()
        : Promise.resolve([]),
      templateIds.length
        ? this.db
            .selectFrom("pdf_templates as template")
            .innerJoin("profiles as author", "author.id", "template.owner_id")
            .select([
              "template.id",
              "template.title",
              "template.slug",
              "template.game_system as gameSystem",
              "template.page_count as pageCount",
              "author.id as authorId",
              "author.username as authorUsername",
              "author.display_name as authorDisplayName",
              (eb) =>
                eb
                  .selectFrom("template_likes")
                  .select(sql<number>`count(*)::int`.as("count"))
                  .whereRef("template_likes.template_id", "=", "template.id")
                  .as("likeCount"),
              (eb) =>
                eb
                  .selectFrom("template_likes")
                  .select(sql<number>`count(*)::int`.as("count"))
                  .whereRef("template_likes.template_id", "=", "template.id")
                  .where("template_likes.user_id", "=", joinActorId)
                  .as("likedByMeCount"),
              (eb) =>
                eb
                  .selectFrom("template_subscriptions")
                  .select(sql<number>`count(*)::int`.as("count"))
                  .whereRef(
                    "template_subscriptions.template_id",
                    "=",
                    "template.id",
                  )
                  .where("template_subscriptions.user_id", "=", joinActorId)
                  .as("remixedByMeCount"),
            ])
            .where("template.id", "in", templateIds)
            .where("template.deleted_at", "is", null)
            .where("template.is_public", "=", true)
            .where("template.catalog_approved_at", "is not", null)
            .where("template.catalog_status", "in", ["ready", "partial"])
            .execute()
        : Promise.resolve([]),
    ]);
    const result = new Map<string, PostEmbed>();
    for (const row of characters) {
      result.set(`character:${row.id}`, {
        kind: "character",
        id: row.id,
        title: row.title,
        slug: row.slug,
        gameSystem: row.gameSystem,
        pageCount: row.pageCount,
        author: {
          id: row.authorId,
          username: row.authorUsername,
          displayName: row.authorDisplayName,
        },
        likeCount: row.likeCount,
        likedByMe: row.likedByMeCount > 0,
        remixedByMe: row.remixedByMeCount > 0,
      });
    }
    for (const row of templates) {
      result.set(`system:${row.id}`, {
        kind: "system",
        id: row.id,
        title: row.title,
        slug: row.slug,
        gameSystem: row.gameSystem,
        pageCount: row.pageCount,
        author: {
          id: row.authorId,
          username: row.authorUsername,
          displayName: row.authorDisplayName,
        },
        likeCount: row.likeCount,
        likedByMe: row.likedByMeCount > 0,
        remixedByMe: row.remixedByMeCount > 0,
      });
    }
    return result;
  }

  private async assertEmbedsArePublic(blocks: PostBlock[]): Promise<void> {
    const embeds = await this.embedsFor(blocks, null);
    const expected = blocks.filter(
      (block) => block.type === "character" || block.type === "system",
    );
    for (const block of expected) {
      const key =
        block.type === "character"
          ? `character:${block.data.characterId}`
          : `system:${block.data.templateId}`;
      if (!embeds.has(key)) {
        throw new AppError(
          "POST_EMBED_NOT_PUBLIC",
          400,
          "Only public characters and systems can be embedded in a post.",
        );
      }
    }
  }

  private async assertImagesBelongTo(
    actorId: string,
    imageIds: string[],
  ): Promise<void> {
    if (!imageIds.length) return;
    const images = await this.db
      .selectFrom("post_images")
      .select("file_id")
      .where("file_id", "in", imageIds)
      .where("uploader_id", "=", actorId)
      .where("post_id", "is", null)
      .execute();
    if (images.length !== imageIds.length) {
      throw new AppError(
        "POST_IMAGE_INVALID",
        400,
        "A post image is invalid or already used.",
      );
    }
  }

  private async requirePost(postId: string): Promise<void> {
    const post = await this.db
      .selectFrom("posts")
      .select("id")
      .where("id", "=", postId)
      .executeTakeFirst();
    if (!post) throw postNotFound();
  }
}

function normalizeBlocks(blocks: PostBlock[]): PostBlock[] {
  return blocks.map((block) => {
    if (block.type === "paragraph") {
      return {
        ...block,
        data: { ...block.data, text: cleanInlineText(block.data.text) },
      };
    }
    if (block.type === "header") {
      return {
        ...block,
        data: { ...block.data, text: cleanInlineText(block.data.text) },
      };
    }
    if (block.type === "quote") {
      return {
        ...block,
        data: {
          text: cleanInlineText(block.data.text),
          caption: cleanInlineText(block.data.caption),
        },
      };
    }
    if (block.type === "list") {
      return {
        ...block,
        data: { ...block.data, items: block.data.items.map(cleanInlineText) },
      };
    }
    return block;
  });
}

function cleanInlineText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function blocksToPlainText(blocks: PostBlock[]): string {
  return blocks
    .flatMap((block) => {
      if (block.type === "paragraph" || block.type === "header")
        return [block.data.text];
      if (block.type === "quote") return [block.data.text, block.data.caption];
      if (block.type === "list") return block.data.items;
      if (block.type === "image") return [block.data.caption || "image"];
      if (block.type === "character") return ["character"];
      if (block.type === "system") return ["system"];
      return [];
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 100_000)
    .trim();
}

function postTitle(blocks: PostBlock[]): string | null {
  const candidate = blocks.find(
    (block) => block.type === "header" || block.type === "paragraph",
  );
  if (
    !candidate ||
    (candidate.type !== "header" && candidate.type !== "paragraph")
  ) {
    return null;
  }
  return candidate.data.text.slice(0, 160).trim() || null;
}

function postSlug(title: string | null, id: string): string {
  const base =
    (title ?? "post")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "post";
  return `${base}-${id.slice(0, 8)}`;
}

function embedListForBlocks(
  blocks: PostBlock[],
  embeds: Map<string, PostEmbed>,
): PostEmbed[] {
  const result: PostEmbed[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const key =
      block.type === "character"
        ? `character:${block.data.characterId}`
        : block.type === "system"
          ? `system:${block.data.templateId}`
          : null;
    if (!key || seen.has(key)) continue;
    const embed = embeds.get(key);
    if (embed) result.push(embed);
    seen.add(key);
  }
  return result;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function postNotFound(): AppError {
  return new AppError("POST_NOT_FOUND", 404, "Post not found.");
}
