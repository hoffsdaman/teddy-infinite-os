import { requireAdmin } from "@/lib/admin-auth";
import { getSupportBoardData } from "@/lib/support";
import { PageHead } from "@/components/admin/PageHead";
import { NewTicketForm } from "./NewTicketForm";
import { SupportBoard } from "./SupportBoard";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata = {
  title: "Support",
  description: "Customer support tickets — one board, every channel.",
};

// Same humaniser as the client card, for the median metric.
function humanDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "under a minute";
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-card admin-section-card" style={{ display: "grid", gap: 2 }}>
      <span className="admin-label" style={{ margin: 0 }}>
        {label}
      </span>
      <strong style={{ fontSize: 24, lineHeight: 1.1 }}>{value}</strong>
      {sub && <span className="admin-cell-muted">{sub}</span>}
    </div>
  );
}

export default async function SupportPage() {
  const admin = await requireAdmin();
  const { tickets, board, metrics } = await getSupportBoardData();

  return (
    <>
      <PageHead
        title="Support"
        sub="Every channel lands here. A ticket is a task — same history, same board."
        action={<NewTicketForm />}
      />

      {/* PR6 — passive time-to-resolve metric, never an SLA. */}
      <div
        style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}
      >
        <Metric label="Open tickets" value={String(metrics.openCount)} />
        <Metric
          label="Median time to resolve"
          value={metrics.medianResolveMs == null ? "—" : humanDuration(metrics.medianResolveMs)}
          sub={`last ${metrics.windowDays} days`}
        />
        <Metric label="Resolved" value={String(metrics.resolvedInWindow)} sub={`last ${metrics.windowDays} days`} />
      </div>

      <SupportBoard tickets={tickets} columns={board.columns} currentUserLabel={admin.email} />
    </>
  );
}
