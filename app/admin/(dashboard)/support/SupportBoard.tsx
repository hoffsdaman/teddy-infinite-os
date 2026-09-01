"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { timeAgo } from "@/lib/admin/format";
import type { SupportColumn, SupportTicket } from "@/lib/support";
import { moveTicket, commentOnTicket, replyToCustomer } from "./actions";

// Human duration for the resolve-time metric: "3d 4h", "2h 10m", "just now".
// Passive reporting only — no targets, no colour-coded breach.
function humanDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "just now";
}

const CHANNEL_LABEL: Record<string, string> = { web_form: "Web form", email: "Email", manual: "Manual" };

function columnTone(col: SupportColumn | undefined): BadgeTone {
  if (!col) return "neutral";
  if (col.is_done) return "ok";
  if (/waiting/i.test(col.name)) return "warn";
  if (/progress/i.test(col.name)) return "info";
  return "neutral";
}

function TicketCard({ ticket, columns }: { ticket: SupportTicket; columns: SupportColumn[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [emailCustomer, setEmailCustomer] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const col = columns.find((c) => c.id === ticket.columnId);
  const resolveMs =
    ticket.isResolved && ticket.completedAt
      ? new Date(ticket.completedAt).getTime() - new Date(ticket.createdAt).getTime()
      : null;

  async function move(toColumnId: string) {
    setSaving(true);
    setError(null);
    const res = await moveTicket(ticket.id, toColumnId);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSaving(true);
    setError(null);
    // "Email the customer" sends outbound via Resend (PR5); otherwise it's an
    // internal note on the thread.
    const res = emailCustomer
      ? await replyToCustomer(ticket.id, reply)
      : await commentOnTicket(ticket.id, reply);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setReply("");
    router.refresh();
  }

  return (
    <div className="admin-card admin-section-card" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {ticket.ticketNo && <span className="admin-cell-mono">{ticket.ticketNo}</span>}
            <Badge tone={columnTone(col)}>{col?.name ?? "—"}</Badge>
            {ticket.channel && <Badge>{CHANNEL_LABEL[ticket.channel] ?? ticket.channel}</Badge>}
          </div>
          <div className="admin-list-title" style={{ marginTop: 4 }}>
            {ticket.subject}
          </div>
          <div className="admin-list-sub">
            {ticket.personId ? (
              <Link href={`/admin/contacts/${ticket.personId}`}>
                {ticket.customerName || ticket.customerEmail || "Customer"}
              </Link>
            ) : (
              ticket.customerName || ticket.customerEmail || "Customer"
            )}
            {ticket.customerEmail ? ` · ${ticket.customerEmail}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div className="admin-cell-muted" title={ticket.createdAt}>
            Arrived {timeAgo(ticket.createdAt)}
          </div>
          {ticket.isResolved && resolveMs != null ? (
            <div className="admin-cell-muted">Resolved in {humanDuration(resolveMs)}</div>
          ) : (
            <div className="admin-cell-muted">
              Open {humanDuration(Date.now() - new Date(ticket.createdAt).getTime())}
            </div>
          )}
        </div>
      </div>

      {ticket.description && (
        <p className="admin-list-sub" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
          {ticket.description}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label className="admin-label" htmlFor={`status-${ticket.id}`} style={{ margin: 0 }}>
          Status
        </label>
        <select
          id={`status-${ticket.id}`}
          className="admin-select"
          value={ticket.columnId ?? ""}
          disabled={saving}
          onChange={(e) => move(e.target.value)}
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="admin-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide" : ticket.comments.length ? `Thread (${ticket.comments.length})` : "Reply"}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      {expanded && (
        <div style={{ display: "grid", gap: 8 }}>
          {ticket.comments.length === 0 ? (
            <div className="admin-empty">No replies yet.</div>
          ) : (
            <div className="admin-list">
              {ticket.comments.map((c) => (
                <div className="admin-list-row" key={c.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-sub" style={{ whiteSpace: "pre-wrap" }}>
                      {c.body}
                    </div>
                    <div className="admin-cell-muted">
                      {c.author} · {timeAgo(c.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={sendReply} style={{ display: "grid", gap: 8 }}>
            <textarea
              className="admin-input"
              rows={3}
              value={reply}
              placeholder={emailCustomer ? "Write the email to the customer…" : "Add an internal note…"}
              onChange={(e) => setReply(e.target.value)}
            />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || !reply.trim()}>
                {saving ? "Saving…" : emailCustomer ? "Send email" : "Add note"}
              </button>
              <label
                className="admin-cell-muted"
                style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: ticket.customerEmail ? "pointer" : "not-allowed" }}
                title={ticket.customerEmail ? `Email ${ticket.customerEmail}` : "No customer email on this ticket"}
              >
                <input
                  type="checkbox"
                  checked={emailCustomer}
                  disabled={!ticket.customerEmail}
                  onChange={(e) => setEmailCustomer(e.target.checked)}
                />
                Email the customer
              </label>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function SupportBoard({ tickets, columns }: { tickets: SupportTicket[]; columns: SupportColumn[] }) {
  if (tickets.length === 0) {
    return <div className="admin-empty">No tickets yet. New ones arrive from the web form, the support inbox, and the button above.</div>;
  }
  // Grouped by column, columns in board order, open work first.
  return (
    <div style={{ display: "grid", gap: 20 }}>
      {columns.map((col) => {
        const inCol = tickets.filter((t) => t.columnId === col.id);
        if (inCol.length === 0) return null;
        return (
          <section key={col.id} style={{ display: "grid", gap: 10 }}>
            <h2 className="admin-card-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {col.name}
              <span className="admin-cell-muted">{inCol.length}</span>
            </h2>
            {inCol.map((t) => (
              <TicketCard key={t.id} ticket={t} columns={columns} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
