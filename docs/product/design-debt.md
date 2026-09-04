# Design debt backlog (4 Sep 2026)

Measured on `main` after the design-system migration (PRs #9 to #19), against
the contract in `docs/product/design-system.md` and the reference repo
`edge8-web` (its `docs/product/design-system.md`, `scripts/design/` guardrails
and converters, and `scripts/check-design-ratchet.mjs`). The "after" column is
filled in by the close-out PR.

## Before / after

| # | Measure | Before | After |
|---|---|---|---|
| 1 | `style={{` blocks in `app/`, `components/`, `lib/` (`.tsx`) | 293 in 76 files; 63 set colour / background / border / radius / font / shadow, 209 layout-only, 21 multi-line blocks the checker cannot parse | |
| 2 | Class prefixes per stylesheet (first dash segment, rules) | `admin.css`: `admin` 1624 (935 distinct), `u` 128, `is` 9, `.phototag` 1 bare class. `globals.css`: 1304 rules across ~50 page prefixes (`xp` 111, `rt` 109, `blog` 64, `contact` 60, `post` 59, `cs` 48, `hero` 48, `careers` 43, `engage` 38, `reserve` 31 …), 261 page-prefixed by the ratchet heuristic. `home.css`: `os` 79. `workflows.css`: `wf` 206. Three `.module.css` sheets (camelCase, scoped). | |
| 3 | Raw colours outside `tokens.css` with every exemption removed | 129 lines in 20 files: `work.module.css` 29, `palette.ts` 15 (the mirror), `ogRender.js` 10, `portal-invite.ts` 10, `api/vietnam-adventure-flight-info` 9, `api/careers/apply` 9, `email.ts` 8, `marketing-email.ts` 7, `cron/board-digest` 7, `api/vietnam-adventure-info-form` 5, `api/contact` 5, `team/signin-link.ts` 4, `contractor-notify.ts` 3, `qr.ts` 2, `admin/signin-link.ts` 2, `talent/team/actions.ts` 2, `onboarding.ts` 1, `survey.module.css` 1, `event.module.css` 1, `cron/ideas-digest` 1 | |
| 4 | Font sizes off the type scale (stylesheets) | 103 declarations, 21 values: 8×3, 9×7, 10×26, 12.5×1, 13.5×1, 17×19, 19×8, 21×3, 22×12, 23×2, 26×4, 30×2, 34×2, 36×3, 38×2, 42×1, 54×1, 56×3, 60×1, 72×1, 400×1; inline `fontSize` off scale 11 (11.5×2, 13.5×1, 17×3, 22×3, 30×2) | |
| 4 | Spacing off the spacing scale (stylesheets) | 223 declarations, 26 values: 1×14, 3×20, 5×23, 7×29, 9×23, 11×17, 13×9, 15×1, 22×20, 26×7, 30×3, 34×3, 36×22, 38×1, 42×1, 44×3, 52×3, 60×4, 72×6, 76×1, 88×1, 92×2, 100×2, 112×1, 128×2, 140×5 | |
| 5 | Page-level `maxWidth` bypassing the sanctioned widths (880 / 640) | 7 values in 7 files: 420 (`MyRetreatGate`), 460 and 560 (`patterns`), 640 (`careers`), 720 (`support`), 780 (`my-retreat/[slug]`), 900 (`workflows/recruitment`); `check:design` flags the 2 OS ones | |
| 6 | Components with their own `<style>` / styled-jsx block or private sheet | 3 style blocks (`BacklogAdminEditor` 51 rules, `BacklogPortalView` 42, `roadmap/styles.ts` 21 used by 2 pages) = 114 rules with 12 private `--pri-*` aliases; `workflows.css` 4 private `--wf-*` aliases; 3 `.module.css` sheets (790 lines) exempt from the colour check | |
| 7 | CSS custom properties used but never defined / fallbacks hiding them | 2 undefined (`--font-mono` in `event.module.css` and `RetreatAgenda`, `--font-sans` in `work.module.css`); 7 fallbacks (`var(--font-body, inherit)` ×2, `var(--font-display, inherit)`, `var(--font-sans, …)`, `var(--font-mono, …)` ×2, `var(--n, 2)` — the last is a deliberate column-count variable) | |
| 8 | Colours stored as hex in the database or shared TS lists | `company_os.tags.color` (text): 0 rows. Stage, channel, role and series lists (`stageColors.ts`, `marketing-calendar.ts`, `ApplicationsBoard`, `DonutChart`) already hold token variables: 0 hex | |
| 9 | Overlapping component classes | progress ×3 (`admin-progress`, `admin-meter`, `admin-campaign-progress`); avatars ×9 (`admin-avatar-initials/-img/-lg/-xs`, `admin-avatarbtn`, `admin-kanban-avatar`, `admin-coach-avatar`, `admin-dir-avatar`, `admin-team-avatar`); boxes ×5 (`admin-box`, `admin-box-pad`, `admin-callout`, `admin-panel-soft`, `admin-assist-box`); chips/tags ×6 (`admin-chip`, `admin-chip-outline`, `admin-tag-pill`, `admin-tag-xs`, `admin-badge-inverse`, `admin-cal-chip`); dividers ×4 (`admin-divider-row`, `admin-row-divided`, `admin-divider-top`, `admin-hr`); scroll ×7 (`admin-scroll-xs/sm/md/lg/vh`, `admin-cal-scroll`, `admin-board-scroll`); big numbers ×5 (`admin-num-lg/-xl`, `admin-money-lg`, `admin-stat-value`, `admin-kpi-val`); text blocks ×2 (`admin-text-block`, `admin-text-md`); thumbnails ×4 (`admin-thumb`, `admin-thumb-img`, `admin-img-thumb`, `admin-campaign-thumb`) | |
| 10 | Non-browser renderers (OG, QR, email) reading one palette module | 16 builders carry 108 raw hex; `lib/design/palette.ts` exists but has 0 importers; the four `opengraph-image.tsx` files render through `lib/ogRender.js` (10 hex) | |
| — | Vercel functions region | `vercel.json` pins `syd1`; Supabase is ap-southeast-2 ✓ | ✓ |
| — | Old class names reintroduced by patches | `ideas-tab` / `ideas-tab--active` (3 lines in `team/ideas/page.tsx`, 2 rules `a.ideas-tab` in `admin.css`) | |

## Commands used

```bash
# 1. inline style blocks, total and per file (ratchet count), and styled vs layout split
grep -rho 'style={{' app components lib --include='*.tsx' | wc -l
node scripts/check-design-ratchet.mjs            # after PR #21; measure() gives per-file counts
STYLED_INLINE_CEILING=9999 node scripts/design/check-tokens.mjs --list   # "styled inline" lines vs the rest
# 2. class prefixes per stylesheet (first dash segment of each leading class, comments stripped)
for f in app/globals.css app/admin/admin.css app/home.css app/workflows/workflows.css; do echo "== $f"; \
  perl -0777 -ne 's{/\*.*?\*/}{}gs; while(/([^{}]+)\{/g){my $p=$1; next if $p=~/^\s*\@/; for my $s (split /,/,$p){$s=~s/^\s+//; $c{$1}++ if $s=~/^\.([a-z][a-z0-9]*)(?:-|\b)/}} print map {"$_ $c{$_}\n"} sort {$c{$b}<=>$c{$a}} keys %c' $f; done
# 3. raw colours everywhere: check-tokens with SKIP_FILE disabled
sed 's/^const SKIP_FILE = .*/const SKIP_FILE = \/^$\/;/' scripts/design/check-tokens.mjs > scripts/design/_all.mjs && \
  STYLED_INLINE_CEILING=9999 node scripts/design/_all.mjs 2>&1 | grep 'raw colour' | cut -d: -f1 | sort | uniq -c | sort -rn; rm scripts/design/_all.mjs
# 4. off-scale font sizes and spacing (px only), by value
node scripts/design/check-assets.mjs             # [off-type-scale] / [off-space-scale] warnings
grep -rhoE 'fontSize: *[0-9.]+' app components --include='*.tsx' | grep -oE '[0-9.]+$' | sort -n | uniq -c
# 5. page-level maxWidth
grep -rnoE 'maxWidth: *[0-9]+' app components --include='*.tsx'
# 6. style blocks and private sheets
grep -rln '<style jsx\|<style ' app components --include='*.tsx'; ls app/**/*.module.css; grep -nE '^\s*--[a-z-]+:' app/workflows/workflows.css
# 7. custom properties used but never defined, and fallbacks
perl -e 'my(%u,%d); for my $f (split /\n/,`git ls-files app components lib | grep -E "\\.(tsx|ts|css)\$"`){open my $h,"<",$f or next; while(<$h>){$u{$1}{$f}=1 while /var\(\s*(--[\w-]+)/g; $d{$1}=1 while /(--[\w-]+)\s*:/g}} for (sort keys %u){print "$_ <- ",join(", ",sort keys %{$u{$_}}),"\n" unless $d{$_}}'
grep -rnoE 'var\(--[a-zA-Z0-9-]+, *[^)]+\)' app components lib --include='*.tsx' --include='*.ts' --include='*.css' | grep -v tokens.css
# 8. colours in the database and shared lists
grep -niE 'colou?r' supabase/01-schema.sql | grep -v '^\s*--'   # then: select count(*), count(color) from company_os.tags
grep -rnoE '#[0-9a-fA-F]{6}\b' lib app --include='*.ts' | grep -v 'opengraph\|/email\|marketing-email\|api/'
# 9. overlapping families
grep -oE '^\.admin-[a-z0-9_-]+' app/admin/admin.css | sort -u | grep -E 'progress|meter|avatar|box|callout|chip|tag-|badge|divider|hr$|scroll|text-|num-|money|stat-value|kpi-val|thumb'
# 10. renderers
for f in lib/email.ts lib/marketing-email.ts lib/ogRender.js lib/qr.ts lib/contractor-notify.ts lib/onboarding.ts lib/admin/portal-invite.ts lib/admin/signin-link.ts lib/team/signin-link.ts; do printf '%s hex=%s palette=%s\n' $f "$(grep -oE '#[0-9a-fA-F]{3,8}\b' $f | wc -l)" "$(grep -c lib/design/palette $f)"; done
grep -rln 'from "@/lib/design/palette"' app lib components
# region
grep -A2 regions vercel.json
```

## Backlog

Order: guardrails and tokens, renames, per-surface inline conversion, scale
normalisation, consolidation, long tail. One PR each.

| # | What | Where | Count | Fix | PR |
|---|---|---|---|---|---|
| 1 | `.u-*` utilities only loaded by the OS surfaces; no CI job; no inline-style / page-prefix ratchet | `admin.css`, `.github/workflows` | 128 rules, 0 workflows | Move `.u-*` to `app/styles/utilities.css` imported by every surface layout after its own sheet; copy `check-design-ratchet.mjs` + baseline; `design-guardrails.yml` runs check-tokens, check-assets and the ratchet on every PR; styled-inline ceiling set to today's count | #21 |
| 2 | Old class names reintroduced by the reference patches; a bare prefix-less class | `team/ideas/page.tsx`, `admin.css` | 3 lines, 2 rules, `.phototag` 1 | Rename `ideas-tab` → `admin-ideas-tab`, `.phototag` → `admin-phototag`; re-scan every tsx/ts/css for the full old-name map | #22 |
| 3 | Inline styles on the public workflow library | `app/workflows` | 150 blocks (14 styled) | `inline-to-classes.pl`, `smart-inline.pl`, hand-finish as `wf-*` modifiers in `workflows.css`; diagram fills stay `layout-ok` | #23 |
| 4 | Inline styles on the marketing and private public pages | `app/my-retreat`, `app/support`, `app/careers`, `app/blog`, `app/page.tsx`, `app/t`, `app/events`, `components/Nav`, `Footer`, `retreat/*`, `experience/*` | 86 blocks (30 styled) | Converters, then hand-finish as `site-*` classes in `app/styles/site-components.css`; prop-driven values `layout-ok` | #24 |
| 5 | Inline styles left on the OS surfaces | `admin/(dashboard)/patterns`, `revenue`, `talent`, `team`, `portal`, `components/admin`, `onboarding`, `hub`, `team` | 57 blocks (19 styled) | Pattern-library demos become `admin-pat-*` classes; the rest are data-driven and get their `layout-ok` comment; the checker learns to parse nested braces | #25 |
| 6 | Font sizes and spacing off the documented scales | `globals.css`, `admin.css`, `home.css`, `workflows.css`, inline `fontSize` | 103 + 223 declarations, 11 inline | Snap to the nearest step (ties downward); 22 / 26 join the type scale as the ramp tokens they already are, 56 as the display step; 1 (hairline) and 140 (hero clamp maximum) join the spacing scale; `scale-ok` exempts the single 400px decorative glyph | #26 |
| 7 | Overlapping component classes | `admin.css` | 3 progress, 9 avatar, 5 box, 6 chip, 4 divider, 7 scroll, 5 number, 2 text, 4 thumb families | One `admin-meter` (progress folded in), one `admin-avatar` with size / tone modifiers, `admin-box` + padding utilities, `admin-tag` modifiers, `admin-divider` modifiers, `admin-scroll` modifiers, `admin-num` modifiers, one `admin-thumb`; every caller updated | #27 |
| 8 | Email, OG and QR builders carry raw hex; `palette.ts` has no readers; `.module.css` sheets and API routes exempt from the colour check | 16 builders, 3 module sheets | 108 hex + 31 raw colours | `lib/design/palette.json` is the source (`palette.ts` re-exports it, `ogRender.js` requires it); builders read it; module sheets read tokens; `SKIP_FILE` shrinks to the token mirror only, `colour-ok` marks the rgba Satori needs | #28 |
| 9 | Components with a private `<style>` block or private colour aliases; undefined custom properties and hiding fallbacks | 3 style blocks, `workflows.css`, `module.css`, `RetreatAgenda`, `support/page` | 114 rules, 16 aliases, 2 undefined, 6 fallbacks | Style blocks move into `admin.css` as `admin-backlog-*` / `admin-roadmap-*` (exact-name rename of `cbe-*`, `cbp-*`, `tcr-*`); `--wf-*` and `--pri-*` aliases inlined to tokens; `--font-mono` / `--font-sans` replaced by `--font-body`; fallbacks removed (`var(--n, 2)` kept and documented) | #29 |
| 10 | Page-level `maxWidth` values bypassing sanctioned widths | 7 files | 7 | `u-max-*` / `admin-content` classes; `check:design` reports none | #29 |
| 11 | Page-prefixed selectors on the public site | `globals.css`, `home.css` | 1304 rules / ~50 prefixes (261 on the ratchet); `os-*` 79 | Page-local rules move into `app/<route>/<route>.css` beside each route layout; shared sections renamed into `site-*` in `site-components.css`; `home.css` becomes the home route sheet; ratchet baseline shrinks to the shared root classes | #30 |
| 12 | `company_os.tags.color` is free text | database | 0 rows | Nothing to migrate; the admin tag editor writes a token name, not hex, and the column comment says so | #31 |
| 13 | Close out | docs | — | After numbers, baselines and ceilings refreshed; every stylesheet holds only its namespace and `.u-*` | #32 |
