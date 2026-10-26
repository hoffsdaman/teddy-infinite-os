"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { editEntryAction } from "@/app/admin/(dashboard)/time/actions";
import type { ShiftRow, ShiftWeek } from "@/lib/time-log-format";

// Weekly shift table for My time and Team time. Rows the viewer may change get
// an Edit button; every edit needs a reason. Edited rows show a badge that
// expands to the edit history.

export function TimeEntryTable({ weeks, zone }: { weeks: ShiftWeek[]; zone: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit(row: ShiftRow) {
    setEditing(row);
    setStart(row.startInput);
    setEnd(row.endInput);
    setReason("");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    const res = await editEntryAction(editing.id, start, end, reason);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  if (weeks.length === 0) {
    return <div className="admin-card admin-empty">No shifts logged in this period.</div>;
  }

  return (
    <>
      {weeks.map((week) => (
        <section className="u-mb-5" key={week.label}>
          <div className="u-row u-between u-mb-2">
            <strong>{week.label}</strong>
            <span>
              Total <strong>{week.total}</strong>
            </span>
          </div>
          <div className="admin-table-wrap">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Hours</th>
                    <th>Note</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {week.rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr>
                        <td>{row.day}</td>
                        <td>{row.start}</td>
                        <td>{row.end}</td>
                        <td>
                          {row.live ? <span className="admin-badge admin-badge--ok admin-badge--dot">live</span> : row.duration}
                        </td>
                        <td className="admin-cell-muted">{row.note ?? ""}</td>
                        <td className="u-row u-gap-2">
                          {row.edited && (
                            <button
                              type="button"
                              className="admin-badge admin-badge--warn"
                              aria-expanded={historyOpen === row.id}
                              onClick={() => setHistoryOpen(historyOpen === row.id ? null : row.id)}
                            >
                              edited
                            </button>
                          )}
                          {row.canEdit && (
                            <button type="button" className="admin-btn" onClick={() => openEdit(row)}>
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                      {historyOpen === row.id && (
                        <tr>
                          <td colSpan={6} className="admin-cell-muted">
                            {row.edits.length === 0
                              ? "Edited (no history recorded)."
                              : row.edits.map((h, i) => (
                                  <div key={i}>
                                    {h.when} · {h.by}: {h.change}. Reason: “{h.reason}”
                                  </div>
                                ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}

      {editing && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-shift-title">
          <form className="admin-modal u-stack u-gap-3" onSubmit={save}>
            <div className="admin-modal-title" id="edit-shift-title">
              Edit shift · {editing.day}
            </div>
            <label className="admin-field">
              <span className="admin-label">Start ({zone}) · was {editing.start}</span>
              <input className="admin-input" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="admin-field">
              <span className="admin-label">End ({zone}) · was {editing.end}</span>
              <input className="admin-input" type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label className="admin-field">
              <span className="admin-label">Reason (required)</span>
              <input
                className="admin-input"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Forgot to start on time"
              />
            </label>
            {error && <div className="admin-alert admin-alert--err">{error}</div>}
            <div className="admin-modal-actions u-mt-0">
              <button type="button" className="admin-btn" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || !reason.trim()}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
