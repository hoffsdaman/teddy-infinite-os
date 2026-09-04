import Link from "next/link";
import { notFound } from "next/navigation";
import { remark } from "remark";
import remarkHtml from "remark-html";
import { requireTeamMember } from "@/lib/team-auth";
import { getSharedIdea, type SharedIdea } from "@/lib/team/data";
import { PageHead } from "@/components/admin/PageHead";
import { Badge } from "@/components/admin/Badge";
import { formatDate } from "@/lib/admin/format";
import { EditablePlan } from "./EditablePlan";
import {
  IDEA_STATUS_LABEL,
  OFFICE_LABEL,
  ideaStatusTone,
  officeTone,
  type IdeaOffice,
  type IdeaStatus,
} from "@/lib/ideas";

export const dynamic = "force-dynamic";

export const metadata = { title: "Idea" };

const D_SECTIONS: { key: keyof SharedIdea; d: string; label: string }[] = [
  { key: "problem", d: "Define", label: "The problem" },
  { key: "data_needed", d: "Discover", label: "Data it needs" },
  { key: "workflow", d: "Design", label: "The workflow" },
  { key: "roi", d: "Determine", label: "Expected ROI" },
];

// Ideas and learnings are company-visible (Learn and Share); getSharedIdea
// hides archived rows from everyone but their submitter.

export default async function IdeaDetailPage({ params }: { params: { id: string } }) {
  const actor = await requireTeamMember();
  const idea = await getSharedIdea(actor, params.id);
  if (!idea) notFound();

  const isOwner = idea.person_id === actor.personId;
  const isLearning = idea.kind === "learning";

  // AI-generated markdown: sanitize on render — the model's output is not a
  // trusted HTML source.
  const aiHtml = idea.ai_plan
    ? String(await remark().use(remarkHtml, { sanitize: true }).process(idea.ai_plan))
    : null;

  return (
    <>
      <PageHead
        eyebrow={isLearning ? "Learning" : "Idea"}
        title={idea.title}
        sub={`${isOwner ? "Submitted" : `Shared by ${idea.submitterName}`} ${formatDate(idea.created_at)}`}
        action={
          <Link href={isLearning ? "/team/ideas" : "/team/ideas?view=plans"} className="admin-btn">
            All ideas
          </Link>
        }
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {idea.office && <Badge tone={officeTone(idea.office)}>{OFFICE_LABEL[idea.office as IdeaOffice]}</Badge>}
        {!isLearning && (
          <Badge tone={ideaStatusTone(idea.status)}>
            {IDEA_STATUS_LABEL[idea.status as IdeaStatus] ?? idea.status}
          </Badge>
        )}
      </div>

      <div className="admin-content">
        {isLearning ? (
          <>
            {aiHtml ? (
              <div className="admin-card" style={{ padding: "22px 24px", marginBottom: 20 }}>
                <h2 className="admin-card-title">The learning</h2>
                <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: aiHtml }} />
              </div>
            ) : null}
            <div className="admin-card" style={{ padding: "22px 24px" }}>
              <h2 className="admin-card-title">{aiHtml ? (isOwner ? "What you shared" : "As shared") : "The learning"}</h2>
              <dl className="admin-kv">
                <div style={{ gridColumn: "1 / -1", marginBottom: 10 }}>
                  <dt style={{ marginBottom: 2 }}>What happened</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{idea.story ?? ""}</dd>
                </div>
                <div style={{ gridColumn: "1 / -1", marginBottom: idea.source_urls?.length ? 10 : 0 }}>
                  <dt style={{ marginBottom: 2 }}>The takeaway</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{idea.takeaway ?? ""}</dd>
                </div>
                {idea.source_urls && idea.source_urls.length > 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <dt style={{ marginBottom: 2 }}>Source</dt>
                    <dd>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {idea.source_urls.map((url) => (
                          <li key={url}>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        ) : (
          <>
            {aiHtml && isOwner ? (
              <EditablePlan
                ideaId={idea.id}
                title={idea.title}
                markdown={idea.ai_plan ?? ""}
                html={aiHtml}
                sub={
                  "Written from your 5D answers. It's in the company backlog now — this is the document to bring when someone asks \"what would we actually build?\""
                }
              />
            ) : aiHtml ? (
              <div className="admin-card" style={{ padding: "22px 24px", marginBottom: 20 }}>
                <h2 className="admin-card-title">The product plan</h2>
                <p className="admin-page-sub" style={{ marginTop: 0 }}>
                  {`Written from ${idea.submitterName}'s 5D answers. It's in the company backlog.`}
                </p>
                <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: aiHtml }} />
              </div>
            ) : (
              <div className="admin-card" style={{ padding: "22px 24px", marginBottom: 20 }}>
                <h2 className="admin-card-title">Plan not ready yet</h2>
                <p className="admin-page-sub" style={{ marginTop: 0 }}>
                  The idea is safely in the backlog, but the product plan didn&apos;t generate. It
                  will be retried — check back here soon.
                </p>
              </div>
            )}

            <div className="admin-card" style={{ padding: "22px 24px" }}>
              <h2 className="admin-card-title">{isOwner ? "What you submitted" : "The 5D answers"}</h2>
              <dl className="admin-kv">
                {D_SECTIONS.map((s) => (
                  <div key={s.key as string} style={{ gridColumn: "1 / -1", marginBottom: 10 }}>
                    <dt style={{ marginBottom: 2 }}>
                      {s.d} · {s.label}
                    </dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>{String(idea[s.key] ?? "")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}
      </div>
    </>
  );
}
