import { z } from "zod";

export const searchTypeSchema = z.enum([
  "all",
  "post",
  "character",
  "template",
  "user",
]);
export type SearchType = z.infer<typeof searchTypeSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  type: searchTypeSchema.optional().default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchItemSchema = z.object({
  id: z.string(),
  type: z.enum(["post", "character", "template", "user"]),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  url: z.string(),
  author: z
    .object({
      id: z.string(),
      username: z.string(),
      displayName: z.string().nullable(),
    })
    .optional(),
  createdAt: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type SearchItem = z.infer<typeof searchItemSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  total: z.number().int().nonnegative(),
  results: z.array(searchItemSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
