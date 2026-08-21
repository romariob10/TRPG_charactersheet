import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "follow",
  "post_reaction",
  "post_comment",
  "direct_message",
  "template_review",
  "system_approved",
  "moderation_warning",
  "character_invite",
  "system",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  actorUsername: z.string().nullable().optional(),
  actorDisplayName: z.string().nullable().optional(),
  type: notificationTypeSchema.or(z.string()),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const listNotificationsResponseSchema = z.object({
  notifications: z.array(notificationItemSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type ListNotificationsResponse = z.infer<typeof listNotificationsResponseSchema>;
