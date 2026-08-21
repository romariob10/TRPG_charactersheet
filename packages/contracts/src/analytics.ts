import { z } from "zod";

export const analyticsPeriodSchema = z.enum(["7d", "30d", "90d"]);
export type AnalyticsPeriod = z.infer<typeof analyticsPeriodSchema>;

export const timeSeriesPointSchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative(),
});
export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;

export const analyticsSummarySchema = z.object({
  period: analyticsPeriodSchema,
  totalUsers: z.number().int().nonnegative(),
  newUsers: z.number().int().nonnegative(),
  totalPosts: z.number().int().nonnegative(),
  newPosts: z.number().int().nonnegative(),
  totalCharacters: z.number().int().nonnegative(),
  newCharacters: z.number().int().nonnegative(),
  totalTemplates: z.number().int().nonnegative(),
  totalComments: z.number().int().nonnegative(),
  totalReactions: z.number().int().nonnegative(),
  totalReports: z.number().int().nonnegative(),
  pendingReports: z.number().int().nonnegative(),
  userGrowth: z.array(timeSeriesPointSchema),
  postVelocity: z.array(timeSeriesPointSchema),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;
