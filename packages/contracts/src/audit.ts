import { z } from "zod";
import { siteRoleSchema } from "./roles.js";

export const adminAuditEventSchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  actorRole: siteRoleSchema.or(z.string()),
  actorUsername: z.string().nullable().optional(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  reason: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  requestId: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminAuditEvent = z.infer<typeof adminAuditEventSchema>;

export const listAdminAuditEventsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
});
export type ListAdminAuditEventsQuery = z.infer<
  typeof listAdminAuditEventsQuerySchema
>;

export const adminAuditEventsResponseSchema = z.object({
  events: z.array(adminAuditEventSchema),
  nextCursor: z.string().nullable(),
});
export type AdminAuditEventsResponse = z.infer<
  typeof adminAuditEventsResponseSchema
>;
