import { PageHead } from "@/components/admin/PageHead";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { loadAgentManagement, type Routine } from "@/lib/admin/agent-management";

export const dynamic = "force-dynamic";

// Settings → Agents. One pane over every managed routine, unified across hosts:
// the Vercel crons (schedules read live from vercel.json) and the local Claude
// Desktop scheduled-tasks (a dated snapshot). Each row shows the four things
// worth seeing: content read, skill/route followed, schedule, apps connected.
// The page's sharpest job is the policy line: routines belong on the Mac mini,
// never on a laptop. Anything on a laptop shows red.

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
              <th style={{ minWidth: 260 }}>Routine</th>
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
                  <div style={{ fontWeight: 600, color: "var(--admin-ink)" }}>{r.name}</div>
                  <div className="admin-cell-muted" style={{ marginTop: 2, maxWidth: 420 }}>
                    {r.description}
                  </div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{r.schedule}</td>
                <td>
                  <ChipList items={r.content} />
                </td>
                <td>
                  <code style={{ fontSize: 12 }}>{r.skill}</code>
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
  const { vercel, local, counts, violations, capture } = loadAgentManagement();

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Agents"
        sub={`${counts.total} managed routines across Vercel and local machines.`}
      />

      {violations.length > 0 && (
        <div className="admin-alert admin-alert--err" style={{ marginBottom: 16 }}>
          <strong>
            {violations.length} {violations.length === 1 ? "routine is" : "routines are"} running on a
            laptop.
          </strong>{" "}
          Policy is zero routines on laptops: they belong on the Mac mini. These were captured from{" "}
          {capture.from} on {capture.at}. Move them to the Mac mini and re-capture.
        </div>
      )}

      <div className="admin-kpi-grid admin-kpi-grid--2up" style={{ marginBottom: 24 }}>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Total routines</div>
          <div className="admin-kpi-val">{counts.total}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">On Vercel</div>
          <div className="admin-kpi-val">{counts.vercel}</div>
          <div className="admin-kpi-note">Cloud crons</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">On Mac mini</div>
          <div className="admin-kpi-val">{counts.macMini}</div>
          <div className="admin-kpi-note">The one machine routines belong on</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">On laptops</div>
          <div
            className="admin-kpi-val"
            style={{ color: counts.laptop > 0 ? "var(--admin-err-ink)" : "var(--admin-ok-ink)" }}
          >
            {counts.laptop}
          </div>
          <div className="admin-kpi-note">{counts.laptop > 0 ? "Policy violation" : "Policy holding"}</div>
        </div>
      </div>

      <section style={{ marginBottom: 32 }}>
        <div className="admin-card-head" style={{ marginBottom: 12 }}>
          <h2 className="admin-card-title">
            Vercel <HostBadge host="vercel" label="Vercel" />
          </h2>
          <span className="admin-cell-muted">Schedules read live from vercel.json</span>
        </div>
        <RoutineTable rows={vercel} />
      </section>

      <section>
        <div className="admin-card-head" style={{ marginBottom: 12 }}>
          <h2 className="admin-card-title">
            Local <HostBadge host="laptop" label="Laptop" />
          </h2>
          <span className="admin-cell-muted">
            Snapshot from {capture.path} on {capture.from}, {capture.at}
          </span>
        </div>
        <RoutineTable rows={local} />
      </section>
    </>
  );
}
