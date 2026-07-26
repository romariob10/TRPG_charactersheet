# DesignMD Product Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved botanical editorial design system to every MyCharacter surface while keeping authenticated tools compact and preserving all existing behavior.

**Architecture:** Establish canonical CSS tokens and shared control variants first, then migrate surfaces by density tier: editorial, product, and tool. Keep styling changes local to existing React components, preserve route/data boundaries, and verify visual behavior through the Docker-hosted application at representative viewport sizes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `next-intl`, Lucide React, Vitest, Docker Compose.

## Global Constraints

- Run Node.js, pnpm, Next.js, Vitest, build, and Playwright commands only through Docker.
- Preserve all existing routes, authentication, PDF behavior, AI workflows, data contracts, localization, and permissions.
- Keep the desktop authenticated header and editor toolbars between 60px and 64px high.
- Use display serif only for page-level and marketing headings; use sans for body, controls, navigation, editor chrome, and dense data.
- Preserve RU and EN glyph support and do not change localized product copy.
- Preserve existing uncommitted changes and review overlapping diffs before editing.
- Do not change database schema, RLS, API contracts, PDF processing, AI tools, autosave behavior, or realtime behavior.
- Use semantic colors and text for error, warning, success, saving, processing, and conflict states.

---

## Planned file structure

- `src/app/globals.css`: canonical botanical, semantic-state, typography, density, radius, focus, and surface tokens.
- `src/app/layout.tsx`: RU/EN-safe display and UI font registration.
- `src/components/ui/button.tsx`: shared action variants and compact size scale.
- `src/components/ui/input.tsx`: shared flat input treatment and focus state.
- `src/components/ui/design-system.test.tsx`: server-rendered regression coverage for shared control semantics and class variants.
- `src/components/logo.tsx`, `src/components/site-header.tsx`, `src/components/app-tabs.tsx`, `src/components/language-switch.tsx`: compact global shell.
- `src/app/page.tsx`, `src/components/auth-shell.tsx`, `src/components/auth-form.tsx`, `src/app/invites/[token]/page.tsx`: editorial and authentication surfaces.
- `src/app/dashboard/**/*.tsx` and non-editor form/card components: product-density dashboard, systems, templates, creation, and management surfaces.
- `src/components/editor/*.tsx`: tool-density editor, mapper, PDF canvas, processing states, and AI assistant.
- `docs/superpowers/specs/2026-07-22-design-md-product-redesign.md`: approved design source of truth; no implementation edits expected.

---

### Task 1: Establish tokens, fonts, and shared controls

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`
- Create: `src/components/ui/design-system.test.tsx`

**Interfaces:**
- Consumes: existing `ButtonProps`, `buttonClassName()`, `Input`, Tailwind v4, and Next font variables.
- Produces: stable CSS custom properties (`--background`, `--surface`, `--foreground`, `--muted`, `--border`, `--brand`, `--brand-strong`, `--brand-soft`, `--sage`, `--keylime`, `--mint-veil`, `--slate`, semantic state tokens, `--font-display`, density/radius tokens) used by all later tasks.

- [ ] **Step 1: Add a failing shared-control regression test**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

describe("botanical design primitives", () => {
  it("keeps buttons compact, accessible, and token-driven", () => {
    const html = renderToStaticMarkup(<Button size="sm">Save</Button>);
    expect(html).toContain("h-9");
    expect(html).toContain("focus-visible:outline-[var(--brand)]");
    expect(buttonClassName({ variant: "secondary" })).toContain("var(--surface)");
  });

  it("uses a flat token-driven input with a visible focus state", () => {
    const html = renderToStaticMarkup(<Input aria-label="Name" />);
    expect(html).toContain("rounded-[var(--radius-control)]");
    expect(html).toContain("focus-visible:ring");
    expect(html).not.toContain("shadow-sm");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails for the new input contract**

Run: `docker compose --profile test run --rm check pnpm test -- src/components/ui/design-system.test.tsx`

Expected: FAIL because `Input` still uses `rounded-xl`, `focus:ring-3`, and `shadow-sm`.

- [ ] **Step 3: Implement the canonical tokens and shared primitives**

Add canonical variables in `globals.css`, including the following exact foundation:

```css
:root {
  --background: #fffefc;
  --surface: #fffefc;
  --surface-strong: #ffffff;
  --foreground: #222222;
  --muted: #65736c;
  --border: #e4e8e3;
  --brand: #0f3e17;
  --brand-strong: #0c2f10;
  --brand-soft: #cfe7d3;
  --sage: #b1dbb8;
  --keylime: #e1f4df;
  --mint-veil: #cfe7d3;
  --slate: #b6ced5;
  --danger: #b3483f;
  --warning: #a66a1f;
  --success: #2f6b42;
  --info: #3f6671;
  --radius-control: 0.625rem;
  --radius-card: 0.875rem;
  --font-display: var(--font-literata), Georgia, serif;
}
```

Register a Cyrillic-capable display serif using `next/font/google`, keep Geist as the sans font, define reusable `.display-heading`, `.app-panel`, `.page-shell`, and density utilities, and remove decorative global shadows/gradients. Update `Button` and `Input` to use `--radius-control`, flat surfaces, explicit focus-visible states, and compact `sm`/`md`/`lg` heights without changing their exported TypeScript interfaces.

- [ ] **Step 4: Run the focused test and static checks**

Run: `docker compose --profile test run --rm check pnpm test -- src/components/ui/design-system.test.tsx`

Expected: PASS, 2 tests.

Run: `docker compose --profile test run --rm check pnpm typecheck`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 5: Review and checkpoint the foundation diff**

Run: `git diff --check -- src/app/globals.css src/app/layout.tsx src/components/ui/button.tsx src/components/ui/input.tsx src/components/ui/design-system.test.tsx`

Expected: no whitespace errors. Do not stage unrelated pre-existing files.

---

### Task 2: Redesign the global shell, landing, auth, and invite surfaces

**Files:**
- Modify: `src/components/logo.tsx`
- Modify: `src/components/site-header.tsx`
- Modify: `src/components/app-tabs.tsx`
- Modify: `src/components/language-switch.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/auth-shell.tsx`
- Modify: `src/components/auth-form.tsx`
- Modify: `src/app/invites/[token]/page.tsx`

**Interfaces:**
- Consumes: Task 1 tokens, `Button`, `buttonClassName()`, `Logo`, `SiteHeader`, existing translations, and existing auth actions.
- Produces: compact 60–64px shell and editorial-density public/auth surfaces used as the visual reference for product pages.

- [ ] **Step 1: Capture the current public and auth rendering before edits**

Run the existing app through Docker and capture desktop screenshots of `/` and `/auth/sign-in`. Record viewport, header height, overflow, and visible first-viewport content. If the currently running Compose project is mounted from another worktree, stop and start this worktree with `docker compose up --build -d` before browser inspection; do not reuse a container mounted from another path.

- [ ] **Step 2: Implement the compact shell**

Keep the desktop header at `h-16`, use a flat Cream Paper background and Border Mist divider, keep the logo mark at 36px or smaller, and preserve the current navigation/action order. For mobile, allow labels to hide while retaining `aria-label`/visible accessible names. Active tabs use `--keylime` plus Forest Ink; inactive items use `--muted` and a transparent background.

- [ ] **Step 3: Implement the editorial landing page**

Preserve the current two-column information architecture and localized CTA labels. Remove the glow and rotation from the product preview, render it as a flat Cream Paper preview inside a Slate Hush panel, keep the main heading responsive with `clamp()` or Tailwind breakpoints, and compose the feature area with alternating botanical surfaces rather than three elevated white cards. Do not add new claims, badges, or sections.

- [ ] **Step 4: Implement auth and invite surfaces**

Use a product-density form column and a Slate/Sage companion panel with Forest Ink text. Convert form and invite headings to the display font only at page level, keep inputs/actions sans, retain all existing error/status roles, and replace large shadows/3xl radii with the shared flat card treatment.

- [ ] **Step 5: Verify public behavior in Docker and browser**

Run: `docker compose --profile test run --rm check pnpm lint`

Expected: exit 0.

Browser checks at approximately 1440×900 and 390×844:

- `/` shows the hero, both CTAs, and product preview without clipping or horizontal overflow.
- Header height is no more than 64px on desktop.
- `/auth/sign-in` keeps the form visible and usable; mobile hides the companion panel cleanly.
- `/invites/invalid` renders a readable invalid-invite state without oversized empty space.

---

### Task 3: Migrate dashboard, systems, templates, and forms to product density

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/new/page.tsx`
- Modify: `src/app/dashboard/systems/page.tsx`
- Modify: `src/app/dashboard/systems/new/page.tsx`
- Modify: `src/app/dashboard/systems/community/page.tsx`
- Modify: `src/components/character-card.tsx`
- Modify: `src/components/community-template-grid.tsx`
- Modify: `src/components/create-character-form.tsx`
- Modify: `src/components/systems-section-tabs.tsx`
- Modify: `src/components/template-upload-form.tsx`
- Modify: `src/components/rename-character-form.tsx`
- Modify: `src/components/permanent-delete-form.tsx`

**Interfaces:**
- Consumes: Task 1 primitives and Task 2 shell; existing Supabase server data, actions, translations, and navigation remain unchanged.
- Produces: consistent product-density cards, lists, tabs, empty states, upload/selection states, and management actions.

- [ ] **Step 1: Run the current component regression tests**

Run: `docker compose --profile test run --rm check pnpm test -- src/app/dashboard/page.test.tsx src/components/catalog-status.test.tsx`

Expected: PASS before visual migration.

- [ ] **Step 2: Normalize page shells and headings**

Use a shared `max-w-7xl` page shell with 20px mobile and 32px desktop horizontal padding. Use 32–40px display page titles, 16–24px gaps around primary sections, and sans uppercase labels only for genuine section navigation. Keep warning/configuration diagnostics semantic rather than recoloring them botanically.

- [ ] **Step 3: Normalize cards, tabs, and empty states**

Use `--radius-card`, flat borders, and no default shadow. Character/template cards retain all links, menus, status labels, metadata, and focus affordances. Active tabs use a botanical fill; empty states use a single restrained Keylime or Slate panel with 32–48px vertical padding rather than 72px+.

- [ ] **Step 4: Normalize forms and upload states**

Keep form groups between 16px and 24px apart. Selection cards must show border, fill, icon/check, and focus state. Upload drag, warning, public/community, pending, error, and disabled states remain semantically distinct. Do not remove the custom-template route from character creation.

- [ ] **Step 5: Re-run component tests and inspect responsive product pages**

Run: `docker compose --profile test run --rm check pnpm test -- src/app/dashboard/page.test.tsx src/components/catalog-status.test.tsx`

Expected: PASS.

Browser checks at desktop and mobile widths:

- `/dashboard` keeps the primary action visible and card menus operable.
- `/dashboard/new` keeps template selection and custom-template action unambiguous.
- `/dashboard/systems`, `/dashboard/systems/community`, and `/dashboard/systems/new` share the same density and do not overflow.

---

### Task 4: Migrate the PDF editor, template mapper, processing, and AI assistant to tool density

**Files:**
- Modify: `src/components/editor/character-editor.tsx`
- Modify: `src/components/editor/ai-assistant.tsx`
- Modify: `src/components/editor/template-mapper.tsx`
- Modify: `src/components/editor/processing-character.tsx`
- Modify: `src/components/editor/template-processing.tsx`
- Modify: `src/components/editor/pdf-field-control.tsx`
- Modify: `src/components/editor/pdf-page.tsx`
- Modify: `src/components/editor/template-pdf-page.tsx`

**Interfaces:**
- Consumes: Task 1 tokens and controls; existing editor props, save queues, PDF rendering, CopilotKit/AG-UI events, proposal state, catalog data, and realtime behavior.
- Produces: compact Cream Paper tool chrome on a Slate Hush workspace with unchanged PDF/AI interaction contracts.

- [ ] **Step 1: Record the editor baseline and critical interaction states**

In the Docker-hosted app, open an authorized character and one editable template. Capture the editor with catalog closed/open and AI closed/open. Record toolbar height, PDF viewport width, sidebar widths, save indicator, export menu, proposal card, and any console/server errors.

- [ ] **Step 2: Normalize editor and mapper chrome**

Keep main toolbars at `h-16` or less, sidebars at their current useful widths unless a measured viewport gain is possible, and tool controls at 32–40px height. Use Cream Paper for toolbars/sidebars, Slate Hush for the document workspace, flat borders for panels, and shadows only on true menus/modals or PDF paper separation. Preserve `min-w-[780px]` for the character editor and the existing mapper minimum width unless testing proves a safe reduction.

- [ ] **Step 3: Normalize PDF controls and processing states**

Retain widget positioning, crop/rotation math, repeated widgets, text area behavior, and unsupported-field behavior. Change only surface, border, focus, label, and state styling. Processing screens use the shared panel/radius system, preserve progress behavior, and keep semantic progress/status communication.

- [ ] **Step 4: Normalize AI assistant and proposal states**

Keep the existing panel position/resize controls, history, new-thread flow, attachments, tool activity, proposal selection, conflict display, confirmation, and instant snapshot application. Apply product/tool density, shared botanical surfaces, and semantic state colors. Use a minimal shadow only for the floating side panel, menus, toast, or modal separation.

- [ ] **Step 5: Run functional regression tests**

Run: `docker compose --profile test run --rm check pnpm test`

Expected: all Vitest files pass with no count regression.

Run: `docker compose --profile test run --rm check pnpm typecheck`

Expected: exit 0.

Browser interaction checks:

- Open/close the catalog without losing excessive PDF space.
- Change a field, observe saving then saved state, and blur to flush.
- Open export controls and confirm both export modes remain available.
- Open/resize/move the AI panel and inspect history/proposal controls.
- Confirm no new client console errors or Next.js overlay.

---

### Task 5: Complete whole-product visual and production verification

**Files:**
- Modify as needed: only files touched in Tasks 1–4 to correct verified regressions.
- Do not keep temporary screenshots or QA artifacts in the repository.

**Interfaces:**
- Consumes: completed visual migration.
- Produces: verified implementation with a fidelity ledger and no known fixable visual drift.

- [ ] **Step 1: Run required checks through Docker**

```bash
docker compose exec -T app pnpm lint
docker compose exec -T app pnpm typecheck
docker compose exec -T app pnpm test
docker compose --profile test run --rm -e NODE_ENV=production check pnpm build
docker compose ps
docker compose logs --tail=250 app
```

Expected: lint, typecheck, tests, and production build exit 0; app is healthy; logs contain no new application errors. If the running `app` container belongs to another worktree, rebuild this worktree first and use its matching container for `exec` checks.

- [ ] **Step 2: Verify representative viewports**

Inspect public/auth/product pages at approximately 1440×900, 1024×768, and 390×844. Inspect the editor at supported desktop/tablet widths. Check copy, header height, layout hierarchy, typography, palette, radii, border/shadow use, overflow, focus, state colors, and primary interactions.

- [ ] **Step 3: Compare screenshots against the approved design direction**

Use `DESIGN.md` and `docs/superpowers/specs/2026-07-22-design-md-product-redesign.md` as the accepted concept. Capture the latest implementation screenshots, inspect them with `view_image`, and write a fidelity ledger covering at least: navigation density, typography, surface palette, card/container model, editor chrome density, responsive behavior, and semantic states. Fix every actionable mismatch.

- [ ] **Step 4: Re-run checks after visual fixes**

Run: `docker compose --profile test run --rm check`

Expected: lint, typecheck, and all tests pass.

Run: `docker compose --profile test run --rm -e NODE_ENV=production check pnpm build`

Expected: production Next.js build passes.

- [ ] **Step 5: Review the final diff without absorbing unrelated work**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; every modified file is either part of this redesign or an explicitly preserved pre-existing change. Do not stage or commit unrelated files.
