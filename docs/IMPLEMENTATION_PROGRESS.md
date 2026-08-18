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
