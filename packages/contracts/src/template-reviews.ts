import { z } from "zod";

export const templateComplexitySchema = z.enum(["rules-light", "medium", "crunchy"]);
export type TemplateComplexity = z.infer<typeof templateComplexitySchema>;

export const templateReviewSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  userId: z.string().uuid(),
  authorUsername: z.string(),
  authorDisplayName: z.string().nullable(),
  rating: z.number().int().min(1).max(5),
  title: z.string().nullable(),
  body: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TemplateReview = z.infer<typeof templateReviewSchema>;

export const createReviewRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional().nullable(),
  body: z.string().max(2000).optional().nullable(),
});
export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;

export const listTemplateReviewsResponseSchema = z.object({
  reviews: z.array(templateReviewSchema),
  ratingAverage: z.number(),
  ratingCount: z.number().int().nonnegative(),
});
export type ListTemplateReviewsResponse = z.infer<typeof listTemplateReviewsResponseSchema>;

export const updateTemplateMetadataRequestSchema = z.object({
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
  genre: z.string().max(50).optional().nullable(),
  complexity: templateComplexitySchema.optional().nullable(),
});
export type UpdateTemplateMetadataRequest = z.infer<typeof updateTemplateMetadataRequestSchema>;
