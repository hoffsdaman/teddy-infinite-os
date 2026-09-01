# UX clean up — hide unused admin nav links

Branch: `ux-clean-up` · 2026-09-01

## Goal

Make the company OS look lean and focused on customer support: fast access to
people (Shopify-synced customers) and their orders. This plan covers **only**
hiding unused sidebar links. Restyling the Company Dashboard and creating the
support workboard are separate follow-ups, not in scope here.

## Approach

Nav-only change in `components/admin/AdminSidebar.tsx`. The `NAV` constant is
data-driven, so the hide is a data edit: replace the full three-section nav
with a lean one. **No routes are deleted or gated** — every hidden page stays
reachable by URL, and the full nav lives in git history for restore
(`git log -- components/admin/AdminSidebar.tsx`).

## What stays visible

| Label | Route | Note |
|---|---|---|
| Dashboard | `/admin` | Company Dashboard (restyle is a follow-up) |
| Customers | `/admin/contacts` | Shopify customers sync into `people`, surfaced here |
| Orders | `/admin/revenue/orders` | Shopify-synced orders |
| Operations › Time Off | `/admin/operations/time-off/*` | Requests, Policies, History |
| Operations › Contractors | `/admin/operations/contractor*` | Work Requests, Contractors, Payments |
| Admins | `/admin/settings/admins` | Access management |
| Agents | `/admin/settings/agents` | Super-admin only, unchanged |

## What gets hidden (nav entries only)

- **Edges**: Client Hubs, Sync, Issues, Reviews
- **Company**: Strategy, Company Goals, Core Values, Org Chart
- **Revenue › CRM**: Cockpit, Deals, Leads, Inquiries, Companies, Clients,
  Meeting Notes, Sales Intelligence
- **Revenue › Commerce**: Invoices, AIO Pad, Events, Products, Affiliates
- **Revenue › Marketing**: Overview, Campaigns, Broadcasts, Brands, Books
- **Talent**: Cockpit, Team, Onboarding, Probation, ATS (Applications, Job
  Reqs, Candidate Pool)
- **Operations**: Cockpit, Retreats P&L, Workplace, Insights (Time Off and
  Contractors stay)
- **Innovation**: Cockpit, Idea backlog
- **Workspace**: Settings › Assume, Settings › Pipelines

Untouched: the Admin/Team view switcher, the disabled Inbox button, the chat
widget, all server-side auth gates.

## Verify

1. `npx tsc --noEmit` passes.
2. Sidebar renders exactly the items above (Agents only for super admins);
   hidden routes still load when visited directly by URL.
