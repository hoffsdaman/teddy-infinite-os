# Design system — migration to the 8 Edges token system

This repo is moving onto the one-token-file design system already running in
`pr-hub-company-os` (PRs #21–#32 there). Sequence, one PR each, merged to
`main` in order: measure → foundation (tokens, utilities, guardrail; no
visible change) → rename every per-feature class prefix into
`.admin-<component>-*` by exact class name → per surface, run
`scripts/design/inline-to-classes.pl` then `scripts/design/smart-inline.pl`,
hand-finish the colour / border / font leftovers as component classes → after
each surface refresh the inline-layout baseline, lower the styled ceiling,
build, eyeball, merge → close out when `admin.css` carries only `.admin-*`
and `.u-*`.

## Baseline (main, 4 Sep 2026, before the foundation PR)

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

How these were counted:

```bash
grep -rn 'style={{' app components --include='*.tsx' | wc -l
grep -oE '^\.[a-z][a-z0-9]*-' app/admin/admin.css | sort | uniq -c | sort -rn
grep -oE '#[0-9a-fA-F]{3,8}\b' app/globals.css app/admin/admin.css app/home.css app/workflows/workflows.css | wc -l
```
