import { z } from "zod";
import { siteRoleSchema } from "./roles.js";

export const adminUserSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  email: z.string(),
  siteRole: siteRoleSchema,
  status: z.enum(["active", "suspended", "banned"]).or(z.string()),
  joinedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  postsCount: z.number().int().nonnegative(),
  charactersCount: z.number().int().nonnegative(),
  templatesCount: z.number().int().nonnegative(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const listAdminUsersQuerySchema = z.object({
  search: z.string().optional(),
  role: siteRoleSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;

export const adminUsersListResponseSchema = z.object({
  users: z.array(adminUserSummarySchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});
export type AdminUsersListResponse = z.infer<
  typeof adminUsersListResponseSchema
>;
