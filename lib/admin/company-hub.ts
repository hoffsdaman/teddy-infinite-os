// Company-scoped (not actor-scoped) loaders for the Client Hub embedded on the
// admin company 360. Authorization is the admin gate on the page (requireAdmin
// via the layout); these take a companyId directly and never widen scope.

import { companyOs } from "@/lib/supabase";
import {
  BACKLOG_SELECT,
  ROADMAP_GROUPS_SELECT,
  effectivePriority,
  effectiveSort,
  groupRank,
  type BacklogItem,
  type BacklogPriority,
  type RoadmapGroup,
} from "@/lib/client-backlog";
import { getAssignmentsForCompany } from "@/lib/admin/staff-assignments";
import type { HubTeam } from "@/lib/team/clients";

export type CompanyRoadmap = {
  overview: string | null;
  groups: RoadmapGroup[];
  items: BacklogItem[];
};

const PRIORITY_RANK: Record<BacklogPriority, number> = { now: 0, next: 1, later: 2, park: 3 };

export async function getCompanyRoadmap(companyId: string): Promise<CompanyRoadmap> {
  const [{ data: itemRows }, { data: groupRows }, { data: overviewRow }] = await Promise.all([
    companyOs.from("client_backlog_items").select(BACKLOG_SELECT).eq("company_id", companyId).is("archived_at", null),
    companyOs
      .from("client_roadmap_groups")
      .select(ROADMAP_GROUPS_SELECT)
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    companyOs.from("client_roadmap_overview").select("body").eq("company_id", companyId).maybeSingle(),
  ]);

  const groups = (groupRows ?? []) as unknown as RoadmapGroup[];
  const rank = groupRank(groups);
  const items = ((itemRows ?? []) as unknown as BacklogItem[]).sort(
    (a, b) =>
      (rank.get(a.group_key) ?? 9999) - (rank.get(b.group_key) ?? 9999) ||
      effectiveSort(a) - effectiveSort(b),
  );
  const overview = ((overviewRow as { body: string } | null)?.body ?? "").trim() || null;
  return { overview, groups, items };
}

export { PRIORITY_RANK, effectivePriority };

// Item ids that already have a live (non-archived) board card, for the roadmap
// editor's "on the board" markers.
export async function getLiveCardItemIds(itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data } = await companyOs
    .from("tasks")
    .select("subject_id")
    .eq("subject_type", "client_backlog_item")
    .in("subject_id", itemIds)
    .is("archived_at", null);
  return new Set(((data ?? []) as { subject_id: string }[]).map((r) => r.subject_id));
}

// Both sides of the account for the Team tab (companyId-scoped mirror of
// getClientTeamForActor).
export async function getCompanyHubTeam(companyId: string): Promise<HubTeam> {
  const [assignments, { data: peopleRows }] = await Promise.all([
    getAssignmentsForCompany(companyId),
    companyOs
      .from("person_companies")
      .select("role, is_primary, people:people!person_id(full_name, email)")
      .eq("company_id", companyId),
  ]);

  const edge8 = assignments
    .filter((a) => a.client_visible)
    .map((a) => ({ name: a.full_name || a.email || "TeddyBed OS", roleTitle: a.role_title || a.position_title }));

  const rows = (peopleRows ?? []) as Array<{
    role: string | null;
    is_primary: boolean | null;
    people: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  }>;
  const client = rows
    .map((r) => {
      const p = Array.isArray(r.people) ? r.people[0] : r.people;
      return { name: p?.full_name || p?.email || "Unknown", title: r.role, isPrimary: !!r.is_primary };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
    .map(({ name, title }) => ({ name, title }));

  return { edge8, client };
}
