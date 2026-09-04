import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/lib/team-auth";
import { getCoachingSession } from "@/lib/team/coaching-sessions";
import { renderPlanMarkdown } from "@/lib/admin/plan-markdown";
import { PageHead } from "@/components/admin/PageHead";
import { formatDate } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Coaching Session" };

function minutes(seconds: number | null): string {
  return seconds ? `${Math.round(seconds / 60)} min` : "—";
}

export default async function CoachingSessionDetailPage({ params }: { params: { id: string } }) {
  await requireTeamMember();
  const session = await getCoachingSession(params.id);
  if (!session) notFound();

  const summaryHtml = session.summary ? await renderPlanMarkdown(session.summary) : null;
  const sub = session.startedAt
    ? `${formatDate(session.startedAt)} · ${minutes(session.durationSeconds)}`
    : minutes(session.durationSeconds);

  return (
    <div>
      <PageHead
        eyebrow="Coaching · Session"
        title={session.title || "Coaching session"}
        sub={sub}
        action={
          <Link className="admin-btn" href="/team/coaching-sessions">
            ← All sessions
          </Link>
        }
      />

      <section className="admin-card admin-section-card" style={{ marginBottom: 14 }}>
        <div className="admin-cell-muted">
          <strong>Participants:</strong> {session.speakers.length > 0 ? session.speakers.join(", ") : "—"}
        </div>
        {session.recordingUrl && (
          <div className="admin-cell-muted" style={{ marginTop: 6 }}>
            <a href={session.recordingUrl} target="_blank" rel="noreferrer">
              Zoom recording
            </a>
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card" style={{ marginBottom: 14 }}>
        <h2 className="admin-card-title">Summary</h2>
        {summaryHtml ? (
          <div className="admin-idea-plan" style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: summaryHtml }} />
        ) : (
          <div className="admin-empty">Summary pending. It generates from the transcript.</div>
        )}
      </section>

      {session.actionItems.length > 0 && (
        <section className="admin-card admin-section-card" style={{ marginBottom: 14 }}>
          <h2 className="admin-card-title">Action items</h2>
          <ul style={{ marginTop: 10 }}>
            {session.actionItems.map((a, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <strong>{a.title}</strong>
                {a.detail ? `: ${a.detail}` : ""}
                {a.dueDate ? ` (due ${a.dueDate})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {session.transcript && (
        <section className="admin-card admin-section-card">
          <details>
            <summary className="admin-card-title" style={{ cursor: "pointer" }}>
              Full transcript
            </summary>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, fontFamily: "inherit" }}>{session.transcript}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
