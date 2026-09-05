"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { DetailDrawer } from "@/components/admin/DetailDrawer";
import { KanbanBoard, type KanbanColumn } from "@/components/admin/KanbanBoard";
import { timeAgo } from "@/lib/admin/format";
import type { SupportColumn, SupportComment, SupportTicket } from "@/lib/support";
import { moveTicket, commentOnTicket, replyToCustomer } from "./actions";
import { cleanEmailBody, emailExcerpt } from "@/lib/support/excerpt";

// A ticket with no activity for this long, still open, gets the amber rail. Support
// is measured in hours, not the 7-day AGING_DAYS the work boards use.
const AGING_HOURS = 24;
// Resolved tickets fall off the board after this many days; the metric still counts them.
const RESOLVED_DAYS_ON_BOARD = 7;

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

// Last thing that happened on the ticket: the newest comment, else its arrival.
function lastActivityAt(t: SupportTicket): string {
  const last = t.comments[t.comments.length - 1];
  return last?.createdAt ?? t.createdAt;
}
function isAging(t: SupportTicket): boolean {
  if (t.isResolved) return false;
  return Date.now() - new Date(lastActivityAt(t)).getTime() > AGING_HOURS * 3600_000;
}

type View = "board" | "list";
type MoveFn = (ticketId: string, toColumnId: string) => Promise<{ ok: boolean; error?: string }>;
type CommentFn = (ticketId: string, body: string, asEmail: boolean) => Promise<{ ok: boolean; error?: string }>;
type Card = SupportTicket & { columnId: string };

// ── Card face (board + list) ─────────────────────────────────────────────────
// Glanceable only: who, what, how long, and whether anyone has touched it. The
// email, the thread and the reply box live in the drawer.
function CardFace({ t }: { t: SupportTicket }) {
  const aging = isAging(t);
  const excerpt = t.description ? emailExcerpt(t.description, 160) : "";
  return (
    <>
      <div className="admin-kanban-card-meta">
        {t.ticketNo && <span className="admin-cell-mono">{t.ticketNo}</span>}
        {t.channel && <Badge>{CHANNEL_LABEL[t.channel] ?? t.channel}</Badge>}
        {t.orderNumber && <Badge tone="info">Order {t.orderNumber}</Badge>}
        {aging && <Badge tone="warn">no reply {humanDuration(Date.now() - new Date(lastActivityAt(t)).getTime())}</Badge>}
      </div>
      <div className="admin-kanban-card-title">{t.subject}</div>
      <div className="admin-kanban-card-sub u-truncate">{t.customerName || t.customerEmail || "Customer"}</div>
      {excerpt && <div className="admin-kanban-card-sub u-clamp-2">{excerpt}</div>}
      <div className="admin-kanban-card-meta">
        <span className="admin-kanban-card-sub" title={t.createdAt}>
          {t.isResolved && t.completedAt
            ? `Resolved in ${humanDuration(new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime())}`
            : `Open ${humanDuration(Date.now() - new Date(t.createdAt).getTime())}`}
        </span>
        {t.comments.length > 0 && <span className="admin-kanban-card-sub u-ml-auto">💬 {t.comments.length}</span>}
      </div>
    </>
  );
}

// ── Drawer: the whole ticket ─────────────────────────────────────────────────
function TicketDrawer({
  ticket,
  columns,
  currentUserLabel,
  onMove,
  onComment,
  onClose,
}: {
  ticket: SupportTicket | null;
  columns: SupportColumn[];
  currentUserLabel: string;
  onMove: MoveFn;
  onComment: CommentFn;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [emailCustomer, setEmailCustomer] = useState(false);
  useEffect(() => {
    setReply("");
    setError(null);
    setEmailCustomer(false);
  }, [ticket?.id]);

  if (!ticket) return null;
  const col = columns.find((c) => c.id === ticket.columnId);
  const body = ticket.description ?? "";
  const cleaned = cleanEmailBody(body);

  async function move(toColumnId: string) {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    const res = await onMove(ticket.id, toColumnId);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Could not update status.");
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket || !reply.trim()) return;
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
    <DetailDrawer
      open
      onClose={onClose}
      eyebrow={
        <span className="u-row u-wrap">
          {ticket.ticketNo && <span className="admin-cell-mono">{ticket.ticketNo}</span>}
          <Badge tone={columnTone(col)}>{col?.name ?? "—"}</Badge>
          {ticket.channel && <Badge>{CHANNEL_LABEL[ticket.channel] ?? ticket.channel}</Badge>}
          {ticket.orderNumber && <Badge tone="info">Order {ticket.orderNumber}</Badge>}
        </span>
      }
      title={ticket.subject}
      action={
        ticket.personId ? (
          <Link className="admin-btn admin-btn--sm" href={`/admin/contacts/${ticket.personId}`}>
            Open contact →
          </Link>
        ) : undefined
      }
    >
      <div className="u-stack u-gap-4">
        <div className="admin-list-sub">
          {ticket.customerName || "Customer"}
          {ticket.customerEmail ? ` · ${ticket.customerEmail}` : ""}
          {" · "}
          <span title={ticket.createdAt}>arrived {timeAgo(ticket.createdAt)}</span>
        </div>

        <div className="u-row u-wrap">
          <label className="admin-label u-m-0" htmlFor="drawer-status">
            Status
          </label>
          <select
            id="drawer-status"
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
        </div>

        {body && (
          <div className="admin-card admin-section-card u-stack u-gap-2">
            <div className="admin-label u-m-0">Message</div>
            <p className="admin-list-sub u-m-0 u-prewrap">{cleaned || body}</p>
            {cleaned !== body.trim() && (
              <details>
                <summary className="admin-summary admin-cell-muted u-sm">Show full email</summary>
                <p className="admin-list-sub u-m-0 u-mt-2 u-prewrap">{body}</p>
              </details>
            )}
          </div>
        )}

        <div className="u-stack u-gap-2">
          <div className="admin-label u-m-0">Notes &amp; replies{ticket.comments.length ? ` (${ticket.comments.length})` : ""}</div>
          {ticket.comments.length === 0 ? (
            <div className="admin-empty">No notes yet. Add the first below.</div>
          ) : (
            <div className="admin-list">
              {ticket.comments.map((c) => (
                <CommentRow key={c.id} c={c} currentUserLabel={currentUserLabel} />
              ))}
            </div>
          )}
        </div>

        {error && <div className="admin-alert admin-alert--err">{error}</div>}

        <form onSubmit={send} className="u-stack">
          <textarea
            className="admin-input"
            rows={4}
            value={reply}
            placeholder={emailCustomer ? "Write the email to the customer…" : "Add an internal note…"}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="u-row u-wrap">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || !reply.trim()}>
              {busy ? "Saving…" : emailCustomer ? "Send email" : "Add note"}
            </button>
            <label
              className={`admin-cell-muted u-row u-gap-1 ${ticket.customerEmail ? "u-pointer" : "u-not-allowed"}`}
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
            <span className="admin-cell-muted u-ml-auto">Commenting as {currentUserLabel}</span>
          </div>
        </form>
      </div>
    </DetailDrawer>
  );
}

// One comment, attributed to its author (an admin email, an outbound "→ customer"
// label, or an inbound "customer via email" label). The signed-in admin is "you".
function CommentRow({ c, currentUserLabel }: { c: SupportComment; currentUserLabel: string }) {
  const mine = c.author === currentUserLabel || c.author.startsWith(`${currentUserLabel} `);
  const initial = (c.author.trim()[0] || "?").toUpperCase();
  return (
    <div className="admin-list-row">
      <div className="admin-list-main u-row u-gap-3">
        <span aria-hidden className="admin-avatar admin-avatar--xs admin-avatar--info">
          {initial}
        </span>
        <div className="u-min-0">
          <div className="u-row u-wrap">
            <strong>{c.author}</strong>
            {mine && <Badge tone="info">you</Badge>}
            <span className="admin-cell-muted">· {timeAgo(c.createdAt)}</span>
          </div>
          <div className="admin-list-sub u-prewrap">{c.body}</div>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<string>("");
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    setTickets(initial);
  }, [initial]);
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

  // Optimistic move: the card lands at once, persists in the background, reverts on failure.
  const onMove: MoveFn = async (ticketId, toColumnId) => {
    const col = columns.find((c) => c.id === toColumnId);
    const prev = tickets;
    setBanner(null);
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
      setBanner(`Couldn't move ticket: ${res.error}`);
      return { ok: false, error: res.error };
    }
    router.refresh();
    return { ok: true };
  };

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

  // Search + channel filter, then: open columns oldest-first (longest wait on top),
  // Resolved newest-first and only the last RESOLVED_DAYS_ON_BOARD days.
  const visible = useMemo<Card[]>(() => {
    const q = query.trim().toLowerCase();
    const cutoff = Date.now() - RESOLVED_DAYS_ON_BOARD * 86400_000;
    return tickets
      .filter((t): t is Card => !!t.columnId)
      .filter((t) => !channel || t.channel === channel)
      .filter(
        (t) =>
          !q ||
          [t.subject, t.customerName, t.customerEmail, t.orderNumber, t.ticketNo]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q)),
      )
      .filter((t) => !t.isResolved || !t.completedAt || new Date(t.completedAt).getTime() >= cutoff)
      .sort((a, b) => {
        if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1;
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return a.isResolved ? tb - ta : ta - tb;
      });
  }, [tickets, query, channel]);

  const boardColumns: KanbanColumn[] = columns.map((c) => ({ id: c.id, label: c.name }));
  const openTicket = tickets.find((t) => t.id === openId) ?? null;
  const channels = Array.from(new Set(tickets.map((t) => t.channel).filter(Boolean))) as string[];

  const toolbar = (
    <div className="u-row u-wrap u-mb-3">
      <input
        className="admin-input u-max-4"
        type="search"
        placeholder="Search subject, customer, order…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search tickets"
      />
      {channels.length > 1 && (
        <div className="admin-chiplist">
          <button type="button" className={`admin-chip${channel === "" ? " is-active" : ""}`} onClick={() => setChannel("")}>
            All
          </button>
          {channels.map((c) => (
            <button
              key={c}
              type="button"
              className={`admin-chip${channel === c ? " is-active" : ""}`}
              onClick={() => setChannel(channel === c ? "" : c)}
            >
              {CHANNEL_LABEL[c] ?? c}
            </button>
          ))}
        </div>
      )}
      <div className="u-row u-clip admin-box u-ml-auto">
        {(["board", "list"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => chooseView(v)}
            className={`admin-btn admin-seg-btn${view === v ? " is-on" : ""}`}
            aria-pressed={view === v}
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
      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}
      {view === "board" ? (
        <KanbanBoard<Card>
          columns={boardColumns}
          cards={visible}
          onMove={(cardId, toColumnId) => void onMove(cardId, toColumnId)}
          onCardClick={(c) => setOpenId(c.id)}
          cardClassName={(c) => (isAging(c) ? "is-aging" : undefined)}
          renderCard={(c) => <CardFace t={c} />}
        />
      ) : (
        <div className="u-stack u-gap-2">
          {visible.length === 0 && <div className="admin-empty">Nothing matches.</div>}
          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`admin-kanban-card admin-kanban-card--static admin-support-row${isAging(t) ? " is-aging" : ""}`}
              onClick={() => setOpenId(t.id)}
            >
              <CardFace t={t} />
            </button>
          ))}
        </div>
      )}
      <TicketDrawer
        ticket={openTicket}
        columns={columns}
        currentUserLabel={currentUserLabel}
        onMove={onMove}
        onComment={onComment}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
