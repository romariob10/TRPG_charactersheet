import { z } from "zod";

export const reportTargetTypeSchema = z.enum([
  "post",
  "comment",
  "character",
  "template",
  "profile",
]);
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;

export const reportStatusSchema = z.enum(["pending", "resolved", "dismissed"]);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const createContentReportRequestSchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: z.string().min(1).max(255),
  reason: z.string().trim().min(3).max(100),
  details: z.string().trim().max(1000).optional(),
});
export type CreateContentReportRequest = z.infer<
  typeof createContentReportRequestSchema
>;

export const contentReportSchema = z.object({
  id: z.string().uuid(),
  reporterId: z.string().uuid().nullable(),
  reporterUsername: z.string().nullable().optional(),
  targetType: reportTargetTypeSchema.or(z.string()),
  targetId: z.string(),
  reason: z.string(),
  details: z.string().nullable(),
  status: reportStatusSchema.or(z.string()),
  moderatorId: z.string().uuid().nullable(),
  moderatorUsername: z.string().nullable().optional(),
  resolutionNote: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type ContentReport = z.infer<typeof contentReportSchema>;

export const listContentReportsQuerySchema = z.object({
  status: reportStatusSchema.or(z.literal("all")).optional().default("pending"),
  targetType: reportTargetTypeSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListContentReportsQuery = z.infer<
  typeof listContentReportsQuerySchema
>;

export const contentReportsListResponseSchema = z.object({
  reports: z.array(contentReportSchema),
  nextCursor: z.string().nullable(),
  totalPending: z.number().int().nonnegative(),
});
export type ContentReportsListResponse = z.infer<
  typeof contentReportsListResponseSchema
>;

export const resolveReportRequestSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  resolutionNote: z.string().trim().max(500).optional(),
  actionTaken: z
    .enum(["none", "delete_content", "ban_author", "warn_author"])
    .optional(),
});
export type ResolveReportRequest = z.infer<typeof resolveReportRequestSchema>;
