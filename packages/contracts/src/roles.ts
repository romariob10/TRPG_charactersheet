import { z } from "zod";

export const siteRoleSchema = z.enum(["admin", "moderator", "user"]);
export type SiteRole = z.infer<typeof siteRoleSchema>;

export const permissionSchema = z.enum([
  "use_platform",
  "view_reports",
  "manage_reports",
  "moderate_content",
  "issue_warning",
  "restrict_user",
  "ban_user",
  "manage_appeals",
  "view_moderator_notes",
  "view_user_emails",
  "manage_moderators",
  "manage_admins",
  "manage_ai_settings",
  "manage_system_settings",
  "view_audit_log",
  "view_moderation_audit",
  "perform_bulk_actions",
]);
export type Permission = z.infer<typeof permissionSchema>;

export const updateUserRoleRequestSchema = z.object({
  role: siteRoleSchema,
  reason: z.string().min(1).max(500).optional(),
});
export type UpdateUserRoleRequest = z.infer<typeof updateUserRoleRequestSchema>;

export const ROLE_PERMISSIONS: Record<SiteRole, readonly Permission[]> = {
  admin: [
    "use_platform",
    "view_reports",
    "manage_reports",
    "moderate_content",
    "issue_warning",
    "restrict_user",
    "ban_user",
    "manage_appeals",
    "view_moderator_notes",
    "view_user_emails",
    "manage_moderators",
    "manage_admins",
    "manage_ai_settings",
    "manage_system_settings",
    "view_audit_log",
    "view_moderation_audit",
    "perform_bulk_actions",
  ],
  moderator: [
    "use_platform",
    "view_reports",
    "manage_reports",
    "moderate_content",
    "issue_warning",
    "restrict_user",
    "manage_appeals",
    "view_moderator_notes",
    "view_moderation_audit",
  ],
  user: ["use_platform"],
};

export function hasPermission(role: SiteRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
