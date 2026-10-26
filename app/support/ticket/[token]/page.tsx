import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { companyOs } from "@/lib/supabase";
import { ensureSupportBoard } from "@/lib/support";
import { cleanEmailBody } from "@/lib/support/excerpt";
import { isCustomerVisibleComment } from "@/lib/support/resolved-email";
import { ReopenForm } from "./ReopenForm";

// The customer's view of one ticket, reached from the "resolved" email. The
// token in the URL is the only credential; internal notes are never shown.

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your support ticket · TeddyBed",
  robots: { index: false, follow: false },
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
}

export default async function CustomerTicketPage({ params }: { params: { token: string } }) {
  const { token } = params;
  if (!token || token.length < 16) notFound();

  const board = await ensureSupportBoard();
  const { data } = await companyOs
    .from("tasks")
    .select("id, title, description, created_at, board_column_id, metadata")
    .eq("board_id", board.id)
    .eq("metadata->>customer_token", token)
    .is("archived_at", null)
    .maybeSingle();
  const t = data as {
    id: string;
    title: string;
    description: string | null;
    created_at: string;
    board_column_id: string | null;
    metadata: { ticket_no?: string; customer_name?: string | null };
  } | null;
  if (!t) notFound();

  const { data: commentRows } = await companyOs
    .from("task_comments")
    .select("id, author_label, body, created_at")
    .eq("task_id", t.id)
    .order("created_at", { ascending: true });
  const comments = ((commentRows ?? []) as { id: string; author_label: string; body: string; created_at: string }[]).filter((c) =>
    isCustomerVisibleComment(c.author_label),
  );

  const column = board.columns.find((c) => c.id === t.board_column_id);
  const resolved = !!column?.is_done;
  const status = resolved ? "Resolved" : column && /waiting/i.test(column.name) ? "Waiting on you" : "We're on it";
  const message = t.description ? cleanEmailBody(t.description) || t.description : "";

  return (
    <main className="site-support-main">
      <div className="container u-mx-auto u-max-7">
        <div className="u-mb-6 u-center-text">
          <span className="site-badge-mint u-mb-4">{status}</span>
          <h1 className="site-support-title">{t.title}</h1>
          <p className="site-support-sub u-m-0">
            {t.metadata.ticket_no ? `Reference ${t.metadata.ticket_no} · ` : ""}opened {when(t.created_at)}
          </p>
        </div>

        <div className="site-form-card u-stack u-gap-4">
          {message && (
            <div>
              <div className="site-label u-mb-2">Your message</div>
              <p className="site-muted u-m-0 u-prewrap">{message}</p>
            </div>
          )}
          {comments.map((c) => {
            const fromUs = c.author_label.includes("→ customer");
            return (
              <div key={c.id}>
                <div className="site-label u-mb-2">
                  {fromUs ? "Teddy support" : "You"} <span className="site-optional">· {when(c.created_at)}</span>
                </div>
                <p className="site-muted u-m-0 u-prewrap">{c.body}</p>
              </div>
            );
          })}
        </div>

        <div className="site-form-card u-mt-5">
          {resolved ? (
            <ReopenForm token={token} />
          ) : (
            <p className="site-muted u-m-0 u-center-text">
              This ticket is open and our team is on it. Reply to any of our emails to add more detail.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
