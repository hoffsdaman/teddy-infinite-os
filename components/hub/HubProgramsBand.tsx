import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { MetricCard } from "@/components/admin/MetricCard";
import type { ProgramStatus, ProgramSummary } from "@/lib/hub/program";
import { formatLeverage, type TokenUsage } from "@/lib/hub/tokens";

// The hub home's top band, shared by the admin company 360 (Client Hub view)
// and the team client hub Overview: the company-grain Human Tokens strip, then
// the AI Programs card grid. Read-only; each card links into the surface's own
// program view via programHref. Markup mirrors the admin hub home verbatim so
// both render identically.

const PROGRAM_STATUS_TONE: Record<ProgramStatus, BadgeTone> = {
  draft: "neutral",
  active: "ok",
  complete: "info",
};

function fmtHours(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function HubProgramsBand({
  usage,
  programs,
  programHref,
}: {
  usage: TokenUsage;
  programs: ProgramSummary[];
  programHref: (programId: string) => string;
}) {
  return (
    <>
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">Human Tokens</h2>
        <span className="admin-cell-muted" style={{ fontSize: 12 }}>Company credit pool, shared by all AI Programs</span>
      </div>
      <div className="admin-kpi-grid" style={{ marginBottom: 20 }}>
        <MetricCard label="Bought" value={usage.boughtTokens.toLocaleString()} sub="Purchased + allocated tokens" />
        <MetricCard label="Delivered" value={fmtHours(usage.deliveredHours)} sub="Hours of tracked work" />
        <MetricCard label="Balance" value={fmtHours(usage.balanceTokens)} sub="Bought minus delivered" />
        <MetricCard label="Planned" value={usage.plannedTokens.toLocaleString()} sub="Roadmap high estimates" />
        <MetricCard
          label="AI leverage"
          value={formatLeverage(usage.leverage)}
          sub="AI value delivered per human hour"
        />
      </div>

      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">AI Programs</h2>
      </div>
      {programs.length === 0 ? (
        <div className="admin-card admin-section-card" style={{ marginBottom: 20 }}>
          <div className="admin-empty">No AI Programs yet. Created from the client portal or by Edge8.</div>
        </div>
      ) : (
        <div className="admin-kpi-grid admin-hub-programs-grid">
          {programs.map((p) => {
            const pct = p.roadmapTotal > 0 ? Math.round((p.roadmapDone / p.roadmapTotal) * 100) : 0;
            return (
              <Link
                key={p.id}
                href={programHref(p.id)}
                className="admin-card admin-section-card admin-hub-program-card"
              >
                <div className="admin-hub-program-head">
                  <span className="admin-cell-strong" style={{ fontSize: 15 }}>{p.name}</span>
                  <Badge tone={PROGRAM_STATUS_TONE[p.status]}>{p.status}</Badge>
                </div>
                <div className="admin-cell-muted admin-cell-mono" style={{ marginTop: 4, minHeight: 18, fontSize: 12, overflowWrap: "anywhere" }}>
                  {p.githubRepo ?? "No repo connected"}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="admin-cell-muted admin-hub-program-progressrow">
                    <span>
                      {p.roadmapTotal === 0
                        ? "No roadmap items yet"
                        : `Roadmap ${p.roadmapDone}/${p.roadmapTotal} done`}
                    </span>
                    {p.roadmapTotal > 0 && <span>{pct}%</span>}
                  </div>
                  <div className="admin-progress">
                    <div className="admin-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="admin-cell-muted" style={{ marginTop: 12, fontSize: 12 }}>
                  {p.repoId
                    ? `${fmtHours(p.deliveredHours)} hrs delivered · ${p.prsMergedLast7d} PR${p.prsMergedLast7d === 1 ? "" : "s"} merged 7d · `
                    : ""}
                  {p.boardCount} {p.boardCount === 1 ? "board" : "boards"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
