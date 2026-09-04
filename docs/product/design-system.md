# Design system — how it works now

One system, one place for every visual decision. This page is the contract;
the older `edge8-design-system*.md` files describe the look and are still the
reference for *why*, but where they disagree with this page on *where things
live*, this page wins.

## Where things live

| What | Where | Rule |
|---|---|---|
| Colours, type ramp, spacing, radii, shadows | `app/styles/tokens.css` | The **only** file allowed to contain a raw colour. Change a value here and it changes everywhere. |
| Brand hex for non-browser renderers (OG images, QR, email) | `lib/design/palette.ts` | Mirrors §1 of `tokens.css`. Keep in sync by hand. |
| App component classes (`.admin-*`, `.u-*`) | `app/admin/admin.css` | Reads tokens by name. No hex, no rgba. Loaded by admin, team and portal. |
| Public-site classes | `app/globals.css`, `app/home.css`, `app/workflows/workflows.css` | Same rule. Translucent colours use `color-mix()` over a token. |
| Pattern library | `/admin/patterns` | Renders every token and component. If a screen doesn't look like this page, the screen is wrong. |
| Guardrail | `npm run check:tokens` (runs as `prebuild`) | Fails on any raw colour outside `tokens.css` / `palette.ts`, and on the styled-inline count rising above its ceiling. |

## Token layers

1. `--teddy-*` and `--color-*` — the palette itself. The five Teddy swatches
   (Yogi, Booboo, Sand, Polar, Winnie) plus their hover tints, the neutral
   ramp and the status hues. Raw values. Never used directly by a component;
   only by the layers below. There is no blue in-brand: Yogi teal carries the
   `--color-primary-blue` role and Winnie gold carries the `--color-accent-mint`
   role, so the role names stay stable across the TeddyBed OS family of repos.
2. `--blue`, `--mint`, `--dark`, `--tint` … — short aliases the public
   marketing pages use. `--font-display` is Roca Two, `--font-body` Manrope,
   `--font-brand-body` Outfit.
3. `--admin-*` — semantic roles for the operating-system surfaces (admin,
   team, portal). **Components use these.** Examples: `--admin-ink`,
   `--admin-muted`, `--admin-line`, `--admin-surface-2`, `--admin-accent`,
   `--admin-ok-bg` / `--admin-ok-ink`, `--admin-radius-sm`,
   `--admin-space-3`, `--admin-text-sm`, `--admin-shadow-md`.

The former `--data-*` layer is gone; its values are now the `--admin-*`
definitions themselves.

## Writing UI

- **Use the shared components first**: `PageHead`, `Tabs`, `MetricCard`
  (KPI), `Badge`, `DataTable`, `DetailDrawer`, `KanbanBoard`, `InlineEdit`,
  `PersonSelect`, `ConfirmButton`. Buttons are `.admin-btn` with
  `--primary`, `--danger`, `--sm`. Chips are `.admin-chip`; pills `.admin-pill`.
- **Layout without inline styles**: `.u-row`, `.u-stack`, `.u-wrap`,
  `.u-between`, `.u-grow`, `.u-grid-2/3/4`, `.u-gap-1…6`, `.u-mt-*`, `.u-mb-*`,
  `.u-muted`, `.u-sm`, `.u-strong`, `.u-truncate`, `.u-label`. Spacing steps are
  4 / 8 / 12 / 16 / 24 / 32.
- **No inline `style={{ color | background | border | borderRadius | fontFamily | boxShadow }}`.**
  Put it in a class. Layout-only inline styles are tolerated during the
  migration; the check reports the count and it must not go up.
- **A new feature gets no new prefix.** Compose from the classes above; if a
  genuinely new component is needed, add it to `admin.css` under the
  Components section and to `/admin/patterns` in the same PR.

## Migration status — complete (4 Sep 2026)

Every surface now runs on the one system. `app/admin/admin.css` carries two
namespaces only: `.admin-*` (1,363 rules) and `.u-*` (128 rules). The 32
per-feature prefixes are gone — 614 class names were renamed by exact name
into `.admin-<component>-*` and every consumer updated. No file outside
`app/styles/tokens.css` (and its mirror `lib/design/palette.ts`) contains a
raw colour; `check:tokens` runs as `prebuild` and holds the line.

| PR | Step |
|---|---|
| #9 | Vercel functions pinned to `syd1` (Supabase is ap-southeast-2) |
| #10 | Measure — the baseline below |
| #11 | Foundation — tokens, utilities, guardrail; no visible change |
| #12 | Rename every per-feature prefix to `admin-*` by exact class name |
| #13 | Core record pages — boards, sprints, client hubs, company / contact records |
| #14 | Admin core — dashboard, settings, support, edges, contacts, shared components |
| #15 | Revenue — deals, leads, marketing, events, invoices, affiliates |
| #16 | Talent and Operations |
| #17 | Team intranet and client portal |
| #18 | Public workflow pages — section bands and labels as classes |

| Measure | Before (#10) | After (#18) |
|---|---|---|
| `style={{` in `app/` + `components/` `.tsx` | 2,381 | 293 |
| …of which set colour / border / font / radius (the guardrail ceiling) | 301 | 63 |
| …layout-only | 2,061 | 209 |
| Class prefixes in `admin.css` | 33 | 2 (`.admin-*`, `.u-*`) |
| Raw colours outside `tokens.css` (guardrail lines) | 564 | 0 |
| Raw hex in the four stylesheets | 199 (+225 rgba) | 0 |

What remains inline, and why it stays:

- **Data-driven values** (46 lines, each with a `/* layout-ok: reason */`
  comment): progress-bar widths, runtime series / stage / channel colours
  that are already token variables, avatar sizes from props, caller-supplied
  style props (`PasswordInput`, `PlaceholderImage`), hidden file inputs.
- **The pattern library itself** (`/admin/patterns`, 10 lines): swatch,
  radius and shadow chips render `var(--token)` values on purpose.
- **Public marketing pages** (`app/workflows`, `app/support`,
  `app/my-retreat`, `careers`, `Nav`, `Footer`; ~40 lines): they load
  `globals.css`, not `admin.css`, so the `.u-*` utilities are not available
  there. `RetreatAgenda` renders on the public my-retreat pages and keeps its
  inline styles for the same reason. Each of these is a candidate for a
  `globals.css` class when the page is next touched.

The guardrail ceiling is set to today's count (63), so it can only go down.
`npm run check:design` still reports two pre-existing findings unrelated to
this migration: a handful of page-level `maxWidth` values outside the three
sanctioned widths, and one inline layout style in `components/Nav.tsx`.

**Adding a new screen:** compose from the classes above. If a pattern truly
needs a new class, add it to the end of `admin.css` under the relevant
component section and to `/admin/patterns` in the same PR. Never a new
prefix, never a raw colour, never an inline colour / border / font.

### Baseline (main, 4 Sep 2026, before the foundation PR)

| Measure | Count |
|---|---|
| `style={{` in `app/` + `components/` `.tsx` | 2,381 (guardrail parse: 301 set colour / border / font / radius; 2,061 layout-only) |
| Class prefixes in `app/admin/admin.css` | 33 (`.admin-` plus 32 per-feature prefixes; 652 distinct class names outside `.admin-*` / `.u-*`) |
| Raw hex in stylesheets | 199 (`globals.css` 81, `admin.css` 98, `home.css` 7, `workflows.css` 13), plus 225 `rgba()` |
| Raw hex in `.ts` / `.tsx` | 280 occurrences across 40 files |
| Guardrail raw-colour lines (app, components, lib; OG / email renderers excluded) | 564 |

Per-feature prefixes and rule counts in `admin.css`: team 169, coach 95,
mcr 87, edges 81, chatw 77, appdet 52, ts 37, lead 32, gallery 32, sap 28,
hire 25, plan 23, idea 22, phototag 16, pat 16, ideas 16, loop 10, cg 10,
portal 9, goal 8, mycoach 7, mp 7, deal 7, hub 6, goals 6, assume 5, tp 4,
staff 4, board 4, dir 3, book 3, assistant 1.

Inline styles by area: revenue 571, team 285, portal 279, talent 266,
workflows (public) 223, components 190, operations 180, boards 117, edges 43,
patterns 36, support (admin) 36, my-retreat 26, company 26, support (public)
22, settings 20, innovation 16, contacts 16, careers 11, other 12.


## Design-debt backlog: cleared (4 Sep 2026)

After the migration, a ten-point audit (`docs/product/design-debt.md`) found the
remaining debt and PRs #21 to #31 cleared it: `.u-*` utilities moved to
`app/styles/utilities.css`; a CI workflow (`design-guardrails.yml`) plus the
inline-style / page-prefix ratchet (`scripts/check-design-ratchet.mjs`) and a
retired-name scan (`scripts/design/check-old-names.mjs`); the public workflow
library and marketing pages converted off inline styles; type and spacing
snapped to the scales; nine overlapping component families consolidated to one
class with modifiers each; the email / OG / QR builders and the three
`.module.css` sheets now read `lib/design/palette.json` / `tokens.css`; the
three roadmap `<style>` blocks folded into `admin.css`; and blog / careers /
post styles moved into route stylesheets. Styled inline styles 63 → 10 (all
data-driven), raw colours outside the token file 129 → 0.

## Rolling out to another repo

`scripts/design/inline-to-classes.pl` (exact patterns) and
`scripts/design/smart-inline.pl` (maps any fully-recognised `style={{}}` to
utilities and merges it into the element's className) do most of the work.
Sequence per repo: measure → foundation PR (tokens, utilities,
`check:tokens` as prebuild) → rename prefixes by exact class name → run both
converters per surface → hand-finish the colour/border leftovers as component
classes → refresh baselines, build, eyeball, merge.
