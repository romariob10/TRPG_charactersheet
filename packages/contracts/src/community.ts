import { z } from "zod";
import { publicAuthorSchema } from "./profiles.js";
import { templateIdSchema } from "./templates.js";

export const commentIdSchema = z.string().uuid();

export const templateCommentSchema = z.object({
  id: commentIdSchema,
  templateId: templateIdSchema,
  author: publicAuthorSchema,
  body: z.string().min(1).max(2000),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const templateCommentListSchema = z.object({
  items: z.array(templateCommentSchema),
  nextCursor: z.string().nullable(),
});

export const createTemplateCommentRequestSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export type TemplateComment = z.infer<typeof templateCommentSchema>;
export type TemplateCommentList = z.infer<typeof templateCommentListSchema>;
export type CreateTemplateCommentRequest = z.infer<
  typeof createTemplateCommentRequestSchema
>;
