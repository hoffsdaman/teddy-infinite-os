"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/admin/Badge";
import { formatDate, humanize } from "@/lib/admin/format";
import { PRIORITY_LABEL, PRIORITY_TONE } from "@/lib/boards/types";
import type { MyWork, MyBoardSummary } from "@/lib/team/boards";
import { moveCard } from "@/app/admin/(dashboard)/boards/[slug]/actions";

export function MyTasks({ work, boards }: { work: MyWork; boards: MyBoardSummary[] }) {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [boardsView, setBoardsView] = useState<"card" | "list">("card");
  const [, startTransition] = useTransition();

  function markDone(taskId: string, doneColumnId: string | null, boardSlug: string) {
    if (!doneColumnId) {
      setBanner("That board has no done column.");
      return;
    }
    setBanner(null);
    setBusyId(taskId);
    moveCard(taskId, doneColumnId, boardSlug).then((r) => {
      setBusyId(null);
      if (!r.ok) setBanner(r.error);
      else startTransition(() => router.refresh());
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {banner && (
        <div className="admin-alert admin-alert--err" style={{ marginBottom: 12 }}>
          {banner}
        </div>
      )}

      <section className="admin-card admin-section-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <h2 className="admin-card-title" style={{ margin: 0 }}>
            My boards <span className="admin-cell-muted">({boards.length})</span>
          </h2>
          {boards.length > 0 && (
            <div className="admin-viewtoggle">
              <button
                className={`admin-tab${boardsView === "card" ? " is-active" : ""}`}
                onClick={() => setBoardsView("card")}
              >
                Cards
              </button>
              <button
                className={`admin-tab${boardsView === "list" ? " is-active" : ""}`}
                onClick={() => setBoardsView("list")}
              >
                List
              </button>
            </div>
          )}
        </div>

        {boards.length === 0 ? (
          <span className="admin-cell-muted">You are not on any boards yet.</span>
        ) : boardsView === "card" ? (
          <div className="admin-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {boards.map((b) => {
              const total = b.openCount + b.doneCount;
              const pct = total > 0 ? Math.round((b.doneCount / total) * 100) : 0;
              return (
                <Link
                  key={b.id}
                  href={`/team/boards/${b.slug}`}
                  className="admin-card admin-section-card is-clickable"
                  style={{ display: "flex", flexDirection: "column", gap: 0, textDecoration: "none" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span className="admin-cell-strong">{b.name}</span>
                    {b.clientName && <Badge tone="info">Client</Badge>}
                  </div>
                  <div className="admin-cell-muted" style={{ marginTop: 4, minHeight: 18 }}>
                    {b.clientName ?? "Internal"}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div
                      className="admin-cell-muted"
                      style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}
                    >
                      <span>
                        {total === 0 ? "No cards yet" : b.openCount === 0 ? "All done" : `${b.openCount} open`}
                      </span>
                      {total > 0 && <span>{pct}% done</span>}
                    </div>
                    <div className="admin-progress">
                      <div className="admin-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="admin-cell-muted" style={{ marginTop: 12, fontSize: 12 }}>
                    {b.assignedToMe} assigned to you
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Board</th>
                  <th style={{ width: 200 }}>Client</th>
                  <th style={{ width: 110, textAlign: "right" }}>Open tasks</th>
                  <th style={{ width: 130, textAlign: "right" }}>Assigned to me</th>
                </tr>
              </thead>
              <tbody>
                {boards.map((b) => (
                  <tr key={b.id} className="is-clickable" onClick={() => router.push(`/team/boards/${b.slug}`)}>
                    <td className="admin-cell-strong">{b.name}</td>
                    <td className="admin-cell-muted">{b.clientName ?? "Internal"}</td>
                    <td style={{ textAlign: "right" }}>{b.openCount}</td>
                    <td style={{ textAlign: "right" }}>{b.assignedToMe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card" style={{ marginBottom: 18 }}>
        <h2 className="admin-card-title" style={{ marginBottom: 10 }}>
          Assigned to me <span className="admin-cell-muted">({work.tasks.length})</span>
        </h2>
        {work.tasks.length === 0 ? (
          <span className="admin-cell-muted">Nothing assigned. Enjoy it.</span>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th style={{ width: 150 }}>Board</th>
                  <th style={{ width: 90 }}>Column</th>
                  <th style={{ width: 90 }}>Priority</th>
                  <th style={{ width: 110 }}>Due</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {work.tasks.map((t) => {
                  const overdue = t.dueDate != null && t.dueDate < today;
                  return (
                    <tr key={t.id}>
                      <td className="admin-cell-strong">{t.title}</td>
                      <td>
                        <Link href={`/team/boards/${t.boardSlug}`} className="admin-cell-strong">
                          {t.boardName}
                        </Link>
                      </td>
                      <td className="admin-cell-muted">{t.columnName}</td>
                      <td>
                        <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                      </td>
                      <td className="admin-cell-muted" style={{ color: overdue ? "var(--admin-err-ink)" : undefined }}>
                        {t.dueDate ? formatDate(t.dueDate) : "—"}
                      </td>
                      <td>
                        <button
                          className="admin-btn admin-btn--sm"
                          disabled={busyId === t.id}
                          onClick={() => markDone(t.id, t.doneColumnId, t.boardSlug)}
                        >
                          {busyId === t.id ? "…" : "Done"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {work.commitments.length > 0 && (
        <section className="admin-card admin-section-card">
          <h2 className="admin-card-title" style={{ marginBottom: 10 }}>
            My open commitments <span className="admin-cell-muted">({work.commitments.length})</span>
          </h2>
          <div className="admin-hint" style={{ marginBottom: 8 }}>
            From your 1-1s. Update these in{" "}
            <Link href="/team/my-coaching" className="admin-cell-strong">
              My Coaching
            </Link>
            .
          </div>
          {work.commitments.map((c) => (
            <div
              key={c.id}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--admin-line)" }}
            >
              <span className="admin-cell-strong" style={{ flex: 1 }}>
                {c.title}
              </span>
              <Badge tone="info">{humanize(c.status)}</Badge>
              {c.dueOn && <span className="admin-cell-muted">{formatDate(c.dueOn)}</span>}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
