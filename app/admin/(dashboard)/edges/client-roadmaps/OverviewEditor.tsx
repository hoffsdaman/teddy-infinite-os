"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotText } from "@/components/assistant/BotText";
import { saveRoadmapOverview } from "./actions";

// Admin editor for the client-facing roadmap overview. Edit raw markdown
// (BotText syntax: **bold**, - bullets, links); the client sees it rendered at
// the top of their roadmap. Collapsed to a preview until you hit Edit.
export function OverviewEditor({ companyId, initialBody }: { companyId: string; initialBody: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    start(async () => {
      const r = await saveRoadmapOverview(companyId, body);
      if (!r.ok) setErr(r.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <section className="admin-card admin-section-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <h2 className="admin-card-title" style={{ margin: 0 }}>Overview <span style={{ fontWeight: 400, color: "var(--admin-ink-2)", fontSize: 13 }}>· shown to the client at the top of their roadmap</span></h2>
        {!editing && (
          <button type="button" className="admin-btn" onClick={() => { setBody(initialBody); setEditing(true); }}>
            {initialBody.trim() ? "Edit" : "Add overview"}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            style={{ width: "100%", fontFamily: "inherit", fontSize: 13, lineHeight: 1.55, padding: "10px 12px", border: "1px solid var(--admin-line)", borderRadius: 8, boxSizing: "border-box" }}
            placeholder="Client-facing overview. Markdown: **bold** lead-ins, blank line between paragraphs, - for bullets."
          />
          {err && <div className="admin-alert admin-alert--err" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save overview"}
            </button>
            <button type="button" className="admin-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : initialBody.trim() ? (
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          <BotText text={initialBody} />
        </div>
      ) : (
        <p className="admin-page-sub" style={{ margin: 0 }}>
          No overview yet. Every roadmap should open with one: a short, client-facing summary of
          what this roadmap is and how the plan works.
        </p>
      )}
    </section>
  );
}
