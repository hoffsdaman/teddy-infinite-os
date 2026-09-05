import { PageHead } from "@/components/admin/PageHead";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { loadAgentManagement, type Routine } from "@/lib/admin/agent-management";

export const dynamic = "force-dynamic";

// Settings → Agents. One pane over every managed routine: the Vercel cron(s),
// schedules read live from vercel.json, plus the event-driven support-email
// sync. Each row shows content read, skill/route followed, schedule, apps.

function ChipList({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="admin-cell-muted">{empty}</span>;
  return (
    <span className="admin-chiplist">
      {items.map((i) => (
        <span key={i} className="admin-chip">
          {i}
        </span>
      ))}
    </span>
  );
}

function HostBadge({ host, label }: { host: Routine["host"]; label: string }) {
  const tone = host === "vercel" ? "info" : host === "mac-mini" ? "ok" : "err";
  return <span className={`admin-badge admin-badge--${tone} admin-badge--dot`}>{label}</span>;
}

function StatusBadge({ status }: { status: Routine["status"] }) {
  const map: Record<Routine["status"], { tone: string; text: string }> = {
    active: { tone: "ok", text: "Active" },
    paused: { tone: "warn", text: "Paused" },
    "one-time": { tone: "info", text: "One-time" },
    manual: { tone: "info", text: "Manual" },
  };
  const { tone, text } = map[status];
  return <span className={`admin-badge admin-badge--${tone}`}>{text}</span>;
}

function RoutineTable({ rows }: { rows: Routine[] }) {
  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-th--xl">Routine</th>
              <th>Schedule</th>
              <th>Content</th>
              <th>Skill / route</th>
              <th>Apps</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="u-strong u-ink">{r.name}</div>
                  <div className="admin-cell-muted u-mt-1 u-max-sm">
                    {r.description}
                  </div>
                </td>
                <td className="u-nowrap">{r.schedule}</td>
                <td>
                  <ChipList items={r.content} />
                </td>
                <td>
                  <code className="u-sm">{r.skill}</code>
                </td>
                <td>
                  <ChipList items={r.apps} />
                </td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AgentsPage() {
  await requireSuperAdmin();
  const { vercel } = loadAgentManagement();

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Agents"
        sub={`${vercel.length} managed routines. Schedules are read live from vercel.json; the email sync runs on demand.`}
      />
      <section>
        <div className="admin-card-head u-mb-3">
          <h2 className="admin-card-title">
            Routines <HostBadge host="vercel" label="Vercel" />
          </h2>
        </div>
        <RoutineTable rows={vercel} />
      </section>
    </>
  );
}
