import { z } from "zod";
import { publicAuthorSchema } from "./profiles.js";

const blockTextSchema = z.string().trim().min(1).max(20_000);

export const postBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    data: z.object({ text: blockTextSchema }),
  }),
  z.object({
    type: z.literal("header"),
    data: z.object({
      text: z.string().trim().min(1).max(500),
      level: z.number().int().min(2).max(4),
    }),
  }),
  z.object({
    type: z.literal("list"),
    data: z.object({
      style: z.enum(["ordered", "unordered", "checklist"]),
      items: z.array(z.string().trim().min(1).max(2_000)).min(1).max(100),
    }),
  }),
  z.object({
    type: z.literal("quote"),
    data: z.object({
      text: blockTextSchema,
      caption: z.string().trim().max(300).default(""),
    }),
  }),
  z.object({ type: z.literal("delimiter"), data: z.object({}) }),
  z.object({
    type: z.literal("image"),
    data: z.object({
      fileId: z.string().uuid(),
      caption: z.string().trim().max(500).default(""),
    }),
  }),
  z.object({
    type: z.literal("character"),
    data: z.object({ characterId: z.string().uuid() }),
  }),
  z.object({
    type: z.literal("system"),
    data: z.object({ templateId: z.string().uuid() }),
  }),
]);

export const createPostRequestSchema = z.object({
  blocks: z.array(postBlockSchema).min(1).max(80),
});

export const postReactionSchema = z.enum([
  "like",
  "joy",
  "moai",
  "fire",
  "mindblown",
  "dice",
]);

export const postReactionSummarySchema = z.object({
  reaction: postReactionSchema,
  count: z.number().int().nonnegative(),
  reactedByMe: z.boolean(),
});

export const postEmbedSchema = z.object({
  kind: z.enum(["character", "system"]),
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  gameSystem: z.string().nullable(),
  pageCount: z.number().int().positive(),
  author: publicAuthorSchema,
  likeCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
  remixedByMe: z.boolean(),
});

export const socialPostSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string().nullable(),
  blocks: z.array(postBlockSchema),
  plainTextLength: z.number().int().nonnegative(),
  isLong: z.boolean(),
  isArticle: z.boolean(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  author: publicAuthorSchema,
  reactions: z.array(postReactionSummarySchema),
  commentCount: z.number().int().nonnegative(),
  viewsCount: z.number().int().nonnegative().default(0),
  isSaved: z.boolean().default(false),
  embeds: z.array(postEmbedSchema),
});

export const createPostCommentRequestSchema = z.object({
  body: z.string().trim().min(1).max(2_000),
});

export const postCommentSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  author: publicAuthorSchema,
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PostBlock = z.infer<typeof postBlockSchema>;
export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;
export type PostReaction = z.infer<typeof postReactionSchema>;
export type PostReactionSummary = z.infer<typeof postReactionSummarySchema>;
export type PostEmbed = z.infer<typeof postEmbedSchema>;
export type SocialPost = z.infer<typeof socialPostSchema>;
export type PostComment = z.infer<typeof postCommentSchema>;
export type CreatePostCommentRequest = z.infer<
  typeof createPostCommentRequestSchema
>;
