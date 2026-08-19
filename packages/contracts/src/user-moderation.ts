import { z } from "zod";

export const moderationActionSchema = z.enum([
  "warn",
  "mute_comments",
  "mute_posts",
  "suspend",
  "ban",
]);
export type ModerationAction = z.infer<typeof moderationActionSchema>;

export const moderateUserRequestSchema = z.object({
  action: moderationActionSchema,
  reason: z.string().trim().min(3).max(500),
  durationHours: z.number().int().positive().max(8760).optional(),
});
export type ModerateUserRequest = z.infer<typeof moderateUserRequestSchema>;

export const userRestrictionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  moderatorId: z.string().uuid().nullable(),
  moderatorUsername: z.string().nullable().optional(),
  action: moderationActionSchema.or(z.string()),
  reason: z.string(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().uuid().nullable(),
  revocationReason: z.string().nullable(),
  createdAt: z.string(),
});
export type UserRestriction = z.infer<typeof userRestrictionSchema>;

export const unbanUserRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type UnbanUserRequest = z.infer<typeof unbanUserRequestSchema>;
