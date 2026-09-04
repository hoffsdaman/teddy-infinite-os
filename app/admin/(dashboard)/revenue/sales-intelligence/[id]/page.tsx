import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCall, scorecardAverage } from "@/lib/admin/calls";
import { analyzeCall, isHostSpeaker } from "@/lib/admin/call-analysis";
import { PageHead } from "@/components/admin/PageHead";
import { renderPlanMarkdown } from "@/lib/admin/plan-markdown";
import { formatDate } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sales Intelligence",
};

const DIMENSIONS: { key: "scoreTalkRatio" | "scorePainQuantified" | "scoreProductFit" | "scoreObjectionSurfaced" | "scoreNextStep"; label: string }[] = [
  { key: "scoreTalkRatio", label: "Talked less than the prospect" },
  { key: "scorePainQuantified", label: "Pain quantified in dollars" },
  { key: "scoreProductFit", label: "Right-product fit confirmed" },
  { key: "scoreObjectionSurfaced", label: "Real objection surfaced live" },
  { key: "scoreNextStep", label: "Next step on the calendar" },
];

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// Details page: one call. The header stats (talk ratio, questions) are computed
// live from the transcript; the five-dimension scorecard comes from the weekly
// scoring pass and is null until the call is scored.
export default async function CallDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const call = await getCall(params.id);
  if (!call) notFound();

  const stats = analyzeCall(call.transcript);
  const avg = scorecardAverage(call.scorecard);
  const coachingHtml = call.scorecard?.coachingMd ? await renderPlanMarkdown(call.scorecard.coachingMd) : null;

  return (
    <div className="admin-content">
      <div style={{ marginBottom: 10 }}>
        <Link className="admin-cell-muted" href="/admin/revenue/sales-intelligence">
          ← All calls
        </Link>
      </div>

      <PageHead
        eyebrow="Revenue · Sales Intelligence"
        title={call.title}
        sub={`${call.startedAt ? formatDate(call.startedAt) : "Date unknown"} · ${fmtDuration(call.durationSeconds)} · ${call.callType}`}
        action={
          call.minuteToken ? (
            <a
              className="admin-btn"
              href={`https://edge8company.sg.larksuite.com/minutes/${call.minuteToken}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Lark
            </a>
          ) : undefined
        }
      />

      <div className="admin-kpi-grid" style={{ marginBottom: 14 }}>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Your talk ratio</div>
          <div className="admin-kpi-val">{stats.talkRatio == null ? "—" : `${Math.round(stats.talkRatio * 100)}%`}</div>
          <div className="admin-kpi-note">target under 45%</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Questions you asked</div>
          <div className="admin-kpi-val">{stats.questionCount}</div>
          <div className="admin-kpi-note">target 15+ on discovery</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Coach score</div>
          <div className="admin-kpi-val">{avg == null ? "—" : `${avg.toFixed(1)} / 5`}</div>
          <div className="admin-kpi-note">{call.scorecard ? `scored ${formatDate(call.scorecard.scoredAt)}` : "not scored yet"}</div>
        </div>
      </div>

      {call.scorecard && (
        <div className="admin-card admin-section-card" style={{ marginBottom: 14 }}>
          <div className="admin-shelf-heading" style={{ marginBottom: 8 }}>Scorecard</div>
          <table className="admin-table" style={{ width: "100%" }}>
            <tbody>
              {DIMENSIONS.map((d) => {
                const v = call.scorecard![d.key];
                return (
                  <tr key={d.key}>
                    <td>{d.label}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {v == null ? (
                        <span className="admin-cell-muted">—</span>
                      ) : (
                        <span className={`admin-badge ${v >= 4 ? "admin-badge--ok" : v >= 3 ? "admin-badge--warn" : "admin-badge--err"}`}>
                          {v} / 5
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {coachingHtml && (
            <div style={{ marginTop: 12 }}>
              <div className="admin-shelf-heading" style={{ marginBottom: 8 }}>Coaching notes</div>
              <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: coachingHtml }} />
            </div>
          )}
        </div>
      )}

      <div className="admin-card admin-section-card" style={{ marginBottom: 14 }}>
        <div className="admin-shelf-heading" style={{ marginBottom: 8 }}>Who talked</div>
        {stats.speakers.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 160, fontSize: 13 }} className={isHostSpeaker(s.name) ? "admin-cell-strong" : undefined}>
              {s.name}
            </div>
            <div style={{ flex: 1, height: 8, background: "var(--admin-border)", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.round(s.share * 100)}%`,
                  height: "100%",
                  background: isHostSpeaker(s.name) ? "var(--admin-accent)" : "var(--admin-muted)",
                }}
              />
            </div>
            <div className="admin-cell-muted" style={{ width: 90, textAlign: "right", fontSize: 13 }}>
              {Math.round(s.share * 100)}% · {s.words.toLocaleString()}w
            </div>
          </div>
        ))}
      </div>

      <div className="admin-card admin-section-card">
        <div className="admin-shelf-heading" style={{ marginBottom: 8 }}>Transcript</div>
        <div style={{ maxHeight: 600, overflow: "auto" }}>
          {stats.segments.map((seg, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12 }}>
                <span className={isHostSpeaker(seg.speaker) ? "admin-cell-strong" : undefined}>{seg.speaker}</span>{" "}
                <span className="admin-cell-muted">{seg.time}</span>
              </div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{seg.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
