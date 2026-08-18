# MyCharacter Implementation Progress Journal

## Capability Matrix (Phase 0 Audit)

| Capability | Status | Evidence | Notes |
|---|:---:|---|---|
| Editor.js in Feed | Verified | `apps/web/src/components/post-composer.tsx` | Inline and expanded lifecycle attached |
| Fullscreen Post Editor | Verified | `apps/web/src/app/dashboard/posts/new/page.tsx`, `FullPostEditor` | Namespaced localStorage draft support |
| Reactions | Verified | `packages/database/migrations/202608180003_extended_reactions.ts`, `PostReactions` | Single-choice replacement, 6 emoji set |
| Comments | Verified | `PostComments`, `apps/api/src/modules/posts/` | Realtime comment list & creation |
| Privacy-safe Views | Verified | `packages/database/migrations/202608180004_post_views_and_bookmarks.ts`, `recordView` | SHA256 hashed IP with daily salt, IntersectionObserver |
| Post Bookmarks | Verified | `post_bookmarks`, `apps/api/src/modules/posts/routes.ts`, `PostFeed` | Dedicated «Сохранённые» tab |
| Character & System Favorites | Partial | `character_likes`, `template_likes` | Needs unified favorites/collections |
| Moderation Reports | Partial | UI mock / report button | Needs database table, queue & resolution workflow |
| AI Settings Console | Verified | `apps/web/src/app/dashboard/admin/page.tsx` | Masked key, server storage |
| User Role Model | Partial | `profiles.is_admin` boolean | Needs `site_role` (admin/moderator/user) & centralized permissions |
| Admin Audit Log | None | — | Target of Phase 2 |
| Sanctions & Appeals | None | — | Target of Phase 7 |
| Scoped MCP Server | Verified | `packages/mcp/` | 14 tools, stdio transport |

---

## Phase 0 — Audit and Stabilization
- Status: verified
- Branch: `codex/feat-feed-ux-and-mcp`
- Commit: `feat: complete feed editor and social interactions`
- Implemented: Inline/full Editor.js draft sync, 6 reactions with single-active replacement, privacy-safe post views with SHA-256 rotating salt, post bookmarks and saved feed tab, 3-dots post management menu.
- Existing behavior reused: Fastify auth plugin, Kysely database migrations, Next.js server actions.
- Migrations: `202608180003_extended_reactions.ts`, `202608180004_post_views_and_bookmarks.ts`.
- Checks passed: `apps/web` unit tests (28 passed), `apps/api` typecheck, `packages/contracts` build, `packages/database` build.
- Manual scenarios passed: Feed rendering, post creation, post deletion, reactions toggle, bookmarks toggle, views increment.
- Known limitations: Raw IP removed in favor of privacy hash.
- Next phase: Phase 1 — Roles and Permissions Foundation.

## Phase 1 — Roles and Permissions Foundation
- Status: verified
- Branch: `codex/feat-rbac-foundation`
- Commit: `feat(auth): add site roles and centralized permissions`
- Implemented: `siteRole` (`admin`, `moderator`, `user`) enum and 17 granular permissions in `@mycharacter/contracts`, `site_role` column in PostgreSQL `profiles` table with backfill for existing admins, session repository and actor hydration with role, centralized `requireRole`, `requirePermission`, `requireModerator`, `requireAdmin`, `can` in API, `PUT /api/admin/users/:id/role` endpoint with last-admin protection, web profile badge and localization.
- Migrations: `202608180005_site_roles.ts`.
- Checks passed: `authorization.test.ts` unit tests (4 tests), `apps/web` unit tests (28 tests), `apps/api` typecheck.
- Manual scenarios passed: Admin, moderator and user role enforcement, unauthorized access rejection with 403, last admin demotion prevented.
- Next phase: Phase 2 — Immutable Administrative Audit Log.

## Phase 2 — Immutable Administrative Audit Log
- Status: verified
- Branch: `codex/feat-audit-log`
- Commit: `feat(admin): add immutable administrative audit log`
- Implemented: Append-only `admin_audit_events` PostgreSQL table with indexes, `@mycharacter/contracts` audit schemas & query contracts, `AuditService` with automatic metadata sanitization (redacting passwords, secrets, tokens, API keys and enforcing payload size limits), `GET /api/admin/audit` endpoint with role-based filtering (moderators restricted to moderation target types), automatic audit event logging for role changes and AI settings updates.
- Migrations: `202608180006_admin_audit_events.ts`.
- Checks passed: `audit.test.ts` unit tests (2 tests), `apps/api` typecheck, `apps/web` vitest (28 tests).
- Manual scenarios passed: Sensitive field redaction, payload truncation, role change and AI settings audit records.
- Next phase: Phase 3 — Professional Administration Console Framework.

## Phase 3 — Professional Administration Console Framework
- Status: verified
- Branch: `codex/feat-admin-console`
- Commit: `feat(admin): build role-aware administration console`
- Implemented: `GET /api/admin/overview` aggregated statistics endpoint (user counts, 24h/7d registration trends, content counts, AI provider status, recent audit activity), Admin shell layout with role-aware tab navigation (Overview, Users, Audit, AI Settings, System), interactive audit log page with action and target filters, system diagnostics health page, AI settings subroute, complete localization in RU & EN.
- Checks passed: `apps/api` typecheck, `apps/web` vitest (28 passed).
- Manual scenarios passed: Admin and Moderator navigation, statistics overview display, interactive audit filtering, system health diagnostic view.
- Next phase: Phase 4 — User and Social Profile Administration.

## Phase 4 — User and Social Profile Administration
- Status: verified
- Branch: `codex/feat-user-management`
- Commit: `feat(admin): add user management table and session control`
- Implemented: `GET /api/admin/users` with searching across usernames/display names/emails, role filtering, joined content activity counts (posts, characters, systems), `POST /api/admin/users/:id/revoke-sessions` with audit logging, role-based email masking for moderators, interactive `AdminUsersTable` in web dashboard with inline role change select, session revocation, and full localization in RU & EN.
- Checks passed: `apps/api` typecheck, `apps/web` typecheck and vitest (28 passed).
- Manual scenarios passed: Search and filter users by role, assign roles with last-admin guard, revoke user sessions with audit event generation.
- Next phase: Phase 5 — Content Moderation and Moderation Queue.

## Phase 5 — Content Moderation and Moderation Queue
- Status: verified
- Branch: `codex/feat-content-moderation`
- Commit: `feat(moderation): add user report pipeline and moderation queue`
- Implemented: `content_reports` PostgreSQL table with indexes, `@mycharacter/contracts` moderation schemas and contracts, `ModerationService` with duplicate report rate limiting and cascading content action enforcement (posts, comments, characters, templates), `POST /api/reports`, `GET /api/admin/reports`, and `PUT /api/admin/reports/:id/resolve` endpoints, integrated 3-dots post report action with API, created `AdminReportsTable` in `/dashboard/admin/reports` with tabbed queues (`pending`, `resolved`, `dismissed`, `all`) and direct resolution actions, with audit logging and full RU/EN localization.
- Migrations: `202608180007_content_reports.ts`.
- Checks passed: `moderation.test.ts` unit test, `apps/api` typecheck, `apps/web` vitest (28 passed).
- Manual scenarios passed: Report creation from feed, duplicate prevention, queue categorization and resolution with audit log recording.
- Next phase: Phase 6 — Content State Management and Lifecycle.

## Phase 6 — Content State Management and Lifecycle
- Status: verified
- Branch: `codex/feat-content-lifecycle`
- Commit: `feat(content): add soft deletion, visibility controls and moderation restore`
- Implemented: `is_hidden` and `deleted_at` columns on `posts`, `deleted_at` on `post_comments` with index, updated feed and comment queries to strictly exclude deleted/hidden content, updated post & comment author deletions to use non-destructive soft-delete (`deleted_at = now()`), added `PUT /api/admin/posts/:id/visibility` and `POST /api/admin/posts/:id/restore` endpoints with administrative audit logging.
- Migrations: `202608180008_content_lifecycle.ts`.
- Checks passed: `content-lifecycle.test.ts` unit test, `apps/api` typecheck, `apps/web` vitest (28 passed).
- Manual scenarios passed: Author soft-delete, feed exclusion of hidden/deleted posts, moderator visibility toggling and post restoration with audit trail.
- Next phase: Phase 7 — User Moderation Actions (Warn, Restrict, Suspend, Ban).

## Phase 7 — User Moderation Actions (Warn, Restrict, Suspend, Ban)
- Status: verified
- Branch: `codex/feat-user-moderation`
- Commit: `feat(moderation): add user restrictions, suspension and ban pipeline`
- Implemented: `user_restrictions` PostgreSQL table with indexes, expanded `UserStatus` enum in DB types (`suspended`, `banned`), created `UserModerationService` with active restriction enforcement (`assertCanPost`, `assertCanComment`), admin-protected restriction checks, automated session termination on suspension/ban, added `POST /api/admin/users/:id/moderate`, `POST /api/admin/users/:id/unban`, and `GET /api/admin/users/:id/moderation-history` endpoints, integrated restriction checks in post and comment authoring, added moderation action controls in web user table, and recorded all moderation actions into the audit log.
- Migrations: `202608180009_user_moderation.ts`.
- Checks passed: `user-moderation.test.ts` unit tests (2 tests), `apps/api` typecheck, `apps/web` vitest (28 passed).
- Manual scenarios passed: Admin protection against moderator bans, active posting and commenting restriction enforcement, user unbanning with audit trail.
- Next phase: Phase 8 — Content Search & Discovery Foundation.

## Phase 8 — Content Search & Discovery Foundation
- Status: verified
- Branch: `codex/feat-search-discovery`
- Commit: `feat(search): add unified search endpoint and discovery interface`
- Implemented: `@mycharacter/contracts` search contracts (`SearchQuery`, `SearchItem`, `SearchResponse`), `SearchService` supporting multi-entity discovery across posts, characters, RPG templates, and community profiles with relevance sorting and privacy safeguards, `GET /api/search` API route with caching headers, interactive `SearchView` at `/dashboard/search` with category filtering tabs and debounced query execution, and updated navigation tabs with Search shortcut.
- Checks passed: `search.test.ts` unit tests, `apps/api` typecheck, `apps/web` vitest (28 passed).
- Manual scenarios passed: Search query across all entities, category tab switching, empty states, and debounced responsive fetching.
- Next phase: Phase 9 — Granular Profile Privacy & Security Settings.

## Phase 9 — Granular Profile Privacy & Security Settings
- Status: verified
- Branch: `codex/feat-profile-privacy`
- Commit: `feat(profile): add granular privacy settings and visibility controls`
- Implemented: `allow_comments`, `show_characters`, `show_templates`, `show_activity` columns in `profiles` table, contracts for `UpdateProfilePrivacyRequest`, `ProfileService.updatePrivacySettings` and `PUT /api/profiles/privacy` API endpoint, enhanced `ProfileService.getPublicProfile` to dynamically filter visible character sheets, rule systems, and activity counters based on author privacy preferences, and added interactive privacy toggle switches with optimistic state in `ProfileSettingsForm` with full RU/EN localization.
- Migrations: `202608180010_profile_privacy.ts`.
- Checks passed: `profile-privacy.test.ts` unit test, `apps/api` typecheck, `apps/web` vitest (28 passed).
- Manual scenarios passed: Privacy preference updates, public profile content filtering when hidden, profile settings switch toggling.
- Next phase: Phase 10 — Notifications & Activity Center.
