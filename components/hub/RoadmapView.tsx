import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { PRIORITY_LABEL, effectivePriority, type BacklogPriority } from "@/lib/client-backlog";
import type { CompanyRoadmap } from "@/lib/admin/company-hub";

// Read-only roadmap view: the same groups, ordering, and effective priorities
// the client sees, rendered from the Badge pill system. Shared by the admin 360
// hub (and available for other read surfaces).
const BACKLOG_PRIORITY_TONE: Record<BacklogPriority, BadgeTone> = {
  now: "info",
  next: "ok",
  later: "neutral",
  park: "warn",
};

export function RoadmapView({ roadmap }: { roadmap: CompanyRoadmap }) {
  const { overview, groups, items } = roadmap;

  return (
    <div className="u-max-narrow">
      {overview && (
        <section className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title u-mb-2">Overview</h2>
          <div className="admin-text-block">{overview}</div>
        </section>
      )}

      {items.length === 0 ? (
        <div className="admin-empty">No roadmap items yet for this client.</div>
      ) : (
        groups.map((g) => {
          const groupItems = items.filter((i) => i.group_key === g.key);
          if (groupItems.length === 0) return null;
          return (
            <section className="admin-card admin-section-card u-mb-4" key={g.key}>
              <div className="u-row u-gap-3 u-wrap u-mb-3">
                {g.step_label && <Badge tone="info">{g.step_label}</Badge>}
                <h2 className="admin-card-title">{g.title}</h2>
              </div>
              <div className="admin-list">
                {groupItems.map((it) => {
                  const priority = effectivePriority(it);
                  return (
                    <div className="admin-list-row" key={it.id}>
                      <div className="admin-list-main">
                        <div className="admin-list-title">{it.ref ? `${it.ref} · ` : ""}{it.title}</div>
                      </div>
                      <div className="admin-list-aside admin-list-aside--row">
                        <Badge tone={BACKLOG_PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
