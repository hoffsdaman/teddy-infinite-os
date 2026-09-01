"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { timeAgo } from "@/lib/admin/format";
import type { SupportColumn, SupportComment, SupportTicket } from "@/lib/support";
import { moveTicket, commentOnTicket, replyToCustomer } from "./actions";

// Human duration for the resolve-time metric: "3d 4h", "2h 10m", "just now".
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

type View = "board" | "list";
type MoveFn = (ticketId: string, toColumnId: string) => Promise<{ ok: boolean; error?: string }>;
type CommentFn = (ticketId: string, body: string, asEmail: boolean) => Promise<{ ok: boolean; error?: string }>;

// ── One ticket ───────────────────────────────────────────────────────────────
function TicketCard({
  ticket,
  columns,
  currentUserLabel,
  onMove,
  onComment,
  compact,
}: {
  ticket: SupportTicket;
  columns: SupportColumn[];
  currentUserLabel: string;
  onMove: MoveFn;
  onComment: CommentFn;
  compact: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [emailCustomer, setEmailCustomer] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  const col = columns.find((c) => c.id === ticket.columnId);
  const resolveMs =
    ticket.isResolved && ticket.completedAt
      ? new Date(ticket.completedAt).getTime() - new Date(ticket.createdAt).getTime()
      : null;

  async function move(toColumnId: string) {
    setBusy(true);
    setError(null);
    const res = await onMove(ticket.id, toColumnId); // optimistic in parent
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Could not update status.");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    const res = await onComment(ticket.id, reply, emailCustomer);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save.");
      return;
    }
    setReply("");
  }

  return (
    <div className="admin-card admin-section-card" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {ticket.ticketNo && <span className="admin-cell-mono">{ticket.ticketNo}</span>}
            <Badge tone={columnTone(col)}>{col?.name ?? "—"}</Badge>
            {ticket.channel && <Badge>{CHANNEL_LABEL[ticket.channel] ?? ticket.channel}</Badge>}
            {ticket.orderNumber && <Badge tone="info">Order {ticket.orderNumber}</Badge>}
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
            <div className="admin-cell-muted">Open {humanDuration(Date.now() - new Date(ticket.createdAt).getTime())}</div>
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
          disabled={busy}
          onChange={(e) => move(e.target.value)}
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="admin-btn" onClick={() => setExpanded((v) => !v)}>
          💬 {expanded ? "Hide" : `Notes & reply${ticket.comments.length ? ` (${ticket.comments.length})` : ""}`}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      {expanded && (
        <div style={{ display: "grid", gap: 8 }}>
          {ticket.comments.length === 0 ? (
            <div className="admin-empty">No notes yet. Add the first below.</div>
          ) : (
            <div className="admin-list">
              {ticket.comments.map((c) => (
                <CommentRow key={c.id} c={c} currentUserLabel={currentUserLabel} />
              ))}
            </div>
          )}
          <form onSubmit={send} style={{ display: "grid", gap: 8 }}>
            <textarea
              className="admin-input"
              rows={3}
              value={reply}
              placeholder={emailCustomer ? "Write the email to the customer…" : "Add an internal note…"}
              onChange={(e) => setReply(e.target.value)}
            />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || !reply.trim()}>
                {busy ? "Saving…" : emailCustomer ? "Send email" : "Add note"}
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
              <span className="admin-cell-muted" style={{ marginLeft: "auto" }}>
                Commenting as {currentUserLabel}
              </span>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// One comment, attributed to its author (an admin email, an outbound "→ customer"
// label, or an inbound "customer via email" label). A comment written by the
// signed-in admin is tagged "you".
function CommentRow({ c, currentUserLabel }: { c: SupportComment; currentUserLabel: string }) {
  const mine = c.author === currentUserLabel || c.author.startsWith(`${currentUserLabel} `);
  const initial = (c.author.trim()[0] || "?").toUpperCase();
  return (
    <div className="admin-list-row">
      <div className="admin-list-main" style={{ display: "flex", gap: 10 }}>
        <span
          aria-hidden
          style={{
            flex: "0 0 auto",
            width: 26,
            height: 26,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            background: "var(--admin-info-bg, rgba(40,123,232,0.15))",
            color: "var(--admin-info-ink, #2b6cb0)",
          }}
        >
          {initial}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>{c.author}</strong>
            {mine && <Badge tone="info">you</Badge>}
            <span className="admin-cell-muted">· {timeAgo(c.createdAt)}</span>
          </div>
          <div className="admin-list-sub" style={{ whiteSpace: "pre-wrap" }}>
            {c.body}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── The board ────────────────────────────────────────────────────────────────
export function SupportBoard({
  tickets: initial,
  columns,
  currentUserLabel,
}: {
  tickets: SupportTicket[];
  columns: SupportColumn[];
  currentUserLabel: string;
}) {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>(initial);
  const [view, setView] = useState<View>("board");

  // Re-sync when the server sends fresh data (after a background refresh).
  useEffect(() => {
    setTickets(initial);
  }, [initial]);

  // Remember the chosen view per browser.
  useEffect(() => {
    try {
      const v = localStorage.getItem("support-view");
      if (v === "list" || v === "board") setView(v);
    } catch {}
  }, []);
  function chooseView(v: View) {
    setView(v);
    try {
      localStorage.setItem("support-view", v);
    } catch {}
  }

  // Optimistic status change (#1): update local state immediately so the card
  // moves at once, persist in the background, and revert if the save fails.
  const onMove: MoveFn = async (ticketId, toColumnId) => {
    const col = columns.find((c) => c.id === toColumnId);
    const prev = tickets;
    setTickets((ts) =>
      ts.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              columnId: toColumnId,
              isResolved: !!col?.is_done,
              completedAt: col?.is_done ? t.completedAt ?? new Date().toISOString() : null,
            }
          : t,
      ),
    );
    const res = await moveTicket(ticketId, toColumnId);
    if (!res.ok) {
      setTickets(prev);
      return { ok: false, error: res.error };
    }
    router.refresh(); // refresh metrics in the background; the card already moved
    return { ok: true };
  };

  // Optimistic comment/reply (#2, #3): append the note attributed to the current
  // admin right away, persist in the background.
  const onComment: CommentFn = async (ticketId, body, asEmail) => {
    const author = asEmail ? `${currentUserLabel} → customer` : currentUserLabel;
    const optimistic: SupportComment = { id: `temp-${Date.now()}`, author, body, createdAt: new Date().toISOString() };
    const prev = tickets;
    setTickets((ts) => ts.map((t) => (t.id === ticketId ? { ...t, comments: [...t.comments, optimistic] } : t)));
    const res = asEmail ? await replyToCustomer(ticketId, body) : await commentOnTicket(ticketId, body);
    if (!res.ok) {
      setTickets(prev);
      return { ok: false, error: res.error };
    }
    router.refresh();
    return { ok: true };
  };

  const toolbar = (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      <div style={{ display: "inline-flex", border: "1px solid var(--admin-line, rgba(0,0,0,0.12))", borderRadius: 8, overflow: "hidden" }}>
        {(["board", "list"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => chooseView(v)}
            className="admin-btn"
            aria-pressed={view === v}
            style={{
              border: "none",
              borderRadius: 0,
              fontWeight: view === v ? 700 : 400,
              background: view === v ? "var(--admin-accent-bg, rgba(40,123,232,0.12))" : "transparent",
            }}
          >
            {v === "board" ? "▦ Board" : "☰ List"}
          </button>
        ))}
      </div>
    </div>
  );

  if (tickets.length === 0) {
    return (
      <>
        {toolbar}
        <div className="admin-empty">No tickets yet. New ones arrive from the web form, the support inbox, and the button above.</div>
      </>
    );
  }

  return (
    <>
      {toolbar}
      {view === "board" ? (
        // Board (kanban): a column per stage, scrolling horizontally if narrow.
        <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
          {columns.map((col) => {
            const inCol = tickets.filter((t) => t.columnId === col.id);
            return (
              <section key={col.id} style={{ flex: "0 0 320px", maxWidth: 320, display: "grid", gap: 10 }}>
                <h2 className="admin-card-title" style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
                  {col.name}
                  <span className="admin-cell-muted">{inCol.length}</span>
                </h2>
                {inCol.length === 0 ? (
                  <div className="admin-empty" style={{ fontSize: 13 }}>
                    —
                  </div>
                ) : (
                  inCol.map((t) => (
                    <TicketCard
                      key={t.id}
                      ticket={t}
                      columns={columns}
                      currentUserLabel={currentUserLabel}
                      onMove={onMove}
                      onComment={onComment}
                      compact
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      ) : (
        // List: every ticket, newest first (server order), full width.
        <div style={{ display: "grid", gap: 10 }}>
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              columns={columns}
              currentUserLabel={currentUserLabel}
              onMove={onMove}
              onComment={onComment}
              compact
            />
          ))}
        </div>
      )}
    </>
  );
}
