# MyCharacter DesignMD Product Redesign

## Goal

Adapt the visual language from `DESIGN.md` to every MyCharacter surface while keeping the product compact, legible, and efficient. The landing page may use a more editorial rhythm; authenticated tools must prioritize working density and clear state.

The redesign changes presentation only. Existing routes, authentication, PDF behavior, AI workflows, data contracts, localization, and permissions remain unchanged.

## Design direction

Use an adaptive application of the reference rather than a literal landing-page transplant.

- Cream Paper is the page canvas.
- Forest Ink is the primary action and heading color.
- Keylime Wash, Mint Veil, Sage Mist, and Slate Hush create hierarchy without shadows.
- Display serif is reserved for page-level and marketing headings.
- Humanist sans is used for body copy, navigation, controls, editor chrome, and dense data.
- Cards and buttons use a consistent 14px radius; tabs and compact controls may use 7–10px radii.
- Shadows are removed except where a temporary overlay needs separation for usability.
- Error, warning, success, saving, and conflict colors remain semantically distinct even when they fall outside the decorative botanical palette.

## Density model

The reference spacing is adapted by surface type.

### Editorial density

Used on the landing page. Sections may use 48–80px vertical spacing, large serif headlines, and 24–32px panel padding. The first viewport must remain balanced and must show product value without an oversized navigation bar.

### Product density

Used on dashboards, auth, creation, template management, and settings-like pages. Page padding is 20–32px, card padding is 16–24px, and control heights remain compact. Page titles may use serif; internal headings and labels remain sans.

### Tool density

Used in the character editor, PDF mapping, field catalog, and AI assistant. Toolbars remain approximately 56–64px high, sidebars preserve their useful width, panels use 12–16px padding, and controls use compact sans typography. Decorative serif typography is not used inside tool chrome.

## Surface design

### Global shell and navigation

- Keep the public and authenticated header between 60px and 64px high on desktop.
- Preserve the existing logo, locale control, authenticated tabs, sign-in, and sign-out actions.
- Use a flat Cream Paper surface and a subtle Border Mist divider.
- Active navigation uses a light botanical fill instead of elevation.
- On narrow screens, prevent actions and labels from forcing horizontal overflow; icon-only fallbacks must retain accessible labels.

### Landing page

- Use a two-column first viewport where space permits: editorial value proposition on the left and a code-native character-sheet preview on Slate Hush on the right.
- Retain all localized product copy and existing calls to action.
- Use serif only for major headings; keep actions and preview UI sans.
- Feature presentation should feel like a composed product story, not a generic grid of floating white cards.
- Remove decorative glows and unnecessary elevation that conflict with the flat surface system.

### Authentication

- Keep the form immediately visible and comfortably narrow.
- Replace the heavy dark promotional panel with a botanical/slate companion surface that maintains readable contrast.
- Preserve all sign-in, sign-up, password reset, callback, and recovery behavior.
- Inputs, validation, error messages, and primary actions must remain visually unambiguous.

### Dashboard and character creation

- Use restrained serif page titles with compact sans metadata and controls.
- Keep character and template lists information-dense; do not enlarge cards to match landing-page spacing.
- Use tinted panels selectively for empty states, selection, and grouping.
- Character creation keeps the existing template selection and custom-template path, with stronger selected, disabled, pending, and error states.

### Systems and template management

- Apply the same shell, tabs, field controls, and panel hierarchy as the dashboard.
- Dense tables, field maps, and management controls remain sans and compact.
- Community and ownership states remain distinguishable through labels and state color, without creating unrelated card styles.

### Character editor

- Preserve the desktop/tablet minimum-width behavior and the PDF-first layout.
- Use Slate Hush as the quiet workspace around the PDF and Cream Paper for tool chrome.
- Keep the main toolbar at 64px or less and avoid oversized buttons.
- Catalog, mapping, export, zoom, save state, collaboration, and AI controls retain their current behavior and information priority.
- Open sidebars must not unnecessarily reduce the usable PDF viewport.
- Save, conflict, processing, and realtime states use semantic colors and text, not color alone.

### AI assistant and overlays

- Proposal cards, history, attachments, tool activity, and confirmation controls use the shared product-density primitives.
- Temporary overlays may use a minimal shadow when a border and surface contrast are insufficient.
- Accepted, rejected, applied, partial, failed, and conflicted proposal states remain clearly differentiated.

## Shared components and tokens

Consolidate visual decisions through existing shared components and CSS variables rather than scattered one-off values.

- Define canonical color, typography, spacing, radius, focus, and semantic-state tokens in `globals.css`.
- Keep `Button`, `Input`, navigation tabs, panels, cards, and status treatments consistent through variants.
- Use the existing icon library and preserve consistent stroke weight, size, and optical alignment.
- Do not introduce raster decoration or new product claims.
- Font loading must support RU and EN without layout shifts or missing glyphs. A suitable serif with Cyrillic support must be selected; Geist remains an acceptable sans baseline.

## Responsive and accessibility requirements

- Preserve desktop and tablet usability in the PDF editor.
- Public, auth, dashboard, and management pages must work without horizontal scrolling at common mobile widths.
- Maintain visible keyboard focus, adequate contrast, semantic landmarks, accessible labels, and non-color state cues.
- Respect reduced-motion preferences; motion is optional and limited to useful state transitions.
- Avoid clipped text, accidental wrapping in primary actions, and controls below practical touch size on mobile.

## Implementation boundaries

- Do not change database schema, RLS, API contracts, PDF processing, AI tools, autosave behavior, or realtime behavior.
- Do not rewrite localized copy unless a layout defect cannot be solved responsively; any such copy change requires explicit approval.
- Preserve existing uncommitted work and refine overlapping files carefully.
- Run all project commands through Docker as required by `AGENTS.md`.

## Verification

At minimum, run in Docker:

```bash
docker compose exec -T app pnpm lint
docker compose exec -T app pnpm typecheck
docker compose exec -T app pnpm test
docker compose --profile test run --rm -e NODE_ENV=production check pnpm build
```

Verify the running application in a browser at desktop, tablet, and mobile widths where supported. Inspect the landing page, authentication, dashboard, character creation, systems/template management, and character editor. Confirm there is no Next.js error overlay, new console error, horizontal overflow, clipped primary content, oversized navigation, or broken core interaction. Compare the rendered surfaces against the approved design direction and record any intentional deviation.

## Acceptance criteria

- Every user-facing surface uses one coherent botanical editorial system.
- The header is compact and never dominates the viewport.
- Working screens remain denser than the landing page and pleasant for sustained use.
- The PDF and AI workflows remain functionally unchanged.
- RU and EN typography remains readable and complete.
- Shared controls have consistent states, focus behavior, radii, and spacing.
- Browser verification and required Docker checks pass, or any pre-existing blocker is reported with evidence.
