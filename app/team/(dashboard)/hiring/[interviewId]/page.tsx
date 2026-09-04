import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/lib/team-auth";
import { PageHead } from "@/components/admin/PageHead";
import { getInterviewKit, type KitScorecard } from "@/lib/team/interview-kit";
import { RECOMMENDATIONS, type RecommendationKey } from "@/lib/admin/interview-panel";
import { ScorecardForm } from "../ScorecardForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Interview kit" };

const REC_LABEL = new Map<RecommendationKey, string>(RECOMMENDATIONS.map((r) => [r.key, r.label]));

function fmtWhen(iso: string | null): string {
  if (!iso) return "Time to be booked";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// The interview kit for one seated panelist: the candidate and AI screen, the
// carry-forward from earlier rounds, this panelist's own scorecard form, and
// (only once they submit) the rest of the panel.
export default async function InterviewKitPage({ params }: { params: { interviewId: string } }) {
  const actor = await requireTeamMember();
  // Access is by seat, not by role: getInterviewKit returns null unless this
  // person is on the panel. An employee interviewer can open their own kit even
  // though they never see the manager hiring board.
  const kit = await getInterviewKit(actor, params.interviewId);
  if (!kit) notFound();

  const meta = [
    kit.stepName,
    kit.reqTitle,
    kit.durationMinutes != null ? `${kit.durationMinutes} min` : null,
    kit.mode,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHead
        eyebrow={<Link href="/team/hiring">← Hiring</Link>}
        title={kit.candidateName}
        sub={`${fmtWhen(kit.scheduledAt)} · ${meta}`}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">
            Resume screen{" "}
            {kit.aiRating != null && <span className="admin-badge admin-badge--info">AI screen {kit.aiRating}</span>}
          </div>
          {kit.aiSummary ? (
            <>
              {kit.aiSummary.overview && (
                <p style={{ marginTop: 8, lineHeight: 1.6 }}>{kit.aiSummary.overview}</p>
              )}
              {kit.aiSummary.skills?.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                  {kit.aiSummary.skills.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              <div className="admin-hint" style={{ marginTop: 10 }}>
                {[
                  kit.aiSummary.english ? `English: ${kit.aiSummary.english}` : null,
                  kit.aiSummary.notice_period ? `Notice: ${kit.aiSummary.notice_period}` : null,
                  // Salary is deliberately omitted here: interviewers are not
                  // super admins, and candidate salary is super-admin-only.
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </>
          ) : (
            <div className="admin-empty">No AI screen on file for this candidate.</div>
          )}
        </section>

        {kit.carryForward && (
          <section className="admin-card admin-coach-section">
            <div className="admin-card-title">From earlier rounds</div>
            <div className="admin-hint">What the AI panelist flagged to verify or ask about this round.</div>
            <p style={{ marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{kit.carryForward}</p>
          </section>
        )}

        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">Your scorecard</div>
          <div className="admin-hint">
            {kit.mySubmitted
              ? "Submitted. You can update it until the round is decided."
              : "Filled in during or right after the interview. The rest of the panel stays hidden until you submit."}
          </div>
          <div style={{ marginTop: 12 }}>
            <ScorecardForm
              interviewId={kit.interviewId}
              criteria={kit.criteria}
              initial={kit.myScorecard}
              submitted={kit.mySubmitted}
            />
          </div>
        </section>

        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">The rest of the panel</div>
          {kit.otherSeats.length === 0 ? (
            <div className="admin-empty">You are the only seat on this round.</div>
          ) : !kit.revealed ? (
            <>
              <div className="admin-hint">
                Blind until you submit. Then everyone&apos;s scorecard opens here, side by side.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {kit.otherSeats.map((s, i) => (
                  <span key={i} className={`admin-badge ${s.submitted ? "admin-badge--ok" : ""}`}>
                    {s.name}
                    {s.isAi ? " (AI)" : ""} · {s.submitted ? "submitted" : "pending"}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
              {kit.otherSeats.map((s, i) => (
                <PanelSeatCard key={i} name={s.name} isAi={s.isAi} scorecard={s.scorecard} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function PanelSeatCard({
  name,
  isAi,
  scorecard,
}: {
  name: string;
  isAi: boolean;
  scorecard: KitScorecard | null;
}) {
  const rec = scorecard?.recommendation ? REC_LABEL.get(scorecard.recommendation) : null;
  return (
    <div className={`admin-hire-seat${isAi ? " admin-hire-seat--ai" : ""}`}>
      <div className="admin-hire-seat-head">
        <span className="admin-hire-seat-name">
          {name}
          {isAi ? " (AI)" : ""}
        </span>
        <span className="admin-hire-seat-chips">
          {rec && <span className="admin-badge admin-badge--info">{rec}</span>}
          {scorecard?.overallScore != null && (
            <span className="admin-badge">Overall {scorecard.overallScore}</span>
          )}
        </span>
      </div>
      {!scorecard || !scorecard.submittedAt ? (
        <div className="admin-hint" style={{ marginTop: 6 }}>
          No scorecard submitted.
        </div>
      ) : (
        <>
          {scorecard.summary && <p style={{ marginTop: 6, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{scorecard.summary}</p>}
          {scorecard.scores.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
              {scorecard.scores.map((sc, i) => (
                <li key={i}>
                  <strong>{sc.criterion}</strong>
                  {sc.score != null ? ` · ${sc.score}` : ""}
                  {sc.comment ? `: ${sc.comment}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
