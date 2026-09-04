"use client";

import { useEffect, useState } from "react";
import { formatCents, formatDate, humanize } from "@/lib/admin/format";
import { getEventQrs, type QrLink } from "./actions";
import { eventStatusBadge } from "./EventStatusBadge";
import type { EventRow } from "./EventsTable";

export type EventTierRow = {
  id: string;
  title: string;
  tier: string | null;
  description: string | null;
  amountCents: number;
  currency: string;
  capacity: number | null;
  active: boolean;
};

export type EventAttendee = {
  name: string | null;
  email: string | null;
  tier: string | null;
  status: string;
  personId: string | null;
  guestCount: number;
  checkedInAt: string | null;
};

// The shelf is deliberately at-a-glance only: the key numbers plus the two
// links an operator shares constantly — signup and feedback survey, each as
// URL + QR. Everything editable (fields, tickets, media, archive) lives on
// the full event page, linked from the drawer header.
export function EventManage({ event }: { event: EventRow }) {
  const [qrs, setQrs] = useState<{ signup: QrLink; feedback: QrLink | null } | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setQrs(null);
    setQrLoading(true);
    setQrError(null);
    getEventQrs(event.id).then((r) => {
      if (cancelled) return;
      if (r.ok) setQrs({ signup: r.signup, feedback: r.feedback });
      else setQrError(r.error);
      setQrLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const dates =
    event.startsAt && event.endsAt && formatDate(event.startsAt) !== formatDate(event.endsAt)
      ? `${formatDate(event.startsAt)} → ${formatDate(event.endsAt)}`
      : formatDate(event.startsAt);

  return (
    <>
      <dl className="admin-kv" style={{ marginBottom: 16 }}>
        <dt>Status</dt>
        <dd>{eventStatusBadge(event.status, event.archivedAt)}</dd>
        <dt>Type</dt>
        <dd>{humanize(event.type)}</dd>
        <dt>Dates</dt>
        <dd>{dates}</dd>
        <dt>Location</dt>
        <dd>{event.location || "—"}</dd>
        <dt>Price</dt>
        <dd className="admin-cell-mono">{event.tiers.length === 0 ? "Free" : `From ${formatCents(event.fromUsdCents, "usd")}`}</dd>
        <dt>Registered</dt>
        <dd>
          {event.registeredCount} seats
          {event.capacity ? ` of ${event.capacity}` : ""}
          {event.totalCount > event.registeredCount ? ` · ${event.totalCount} total rows` : ""}
        </dd>
        <dt>Collected</dt>
        <dd className="admin-cell-mono">{formatCents(event.collectedUsdCents, "usd")}</dd>
        <dt>Slug</dt>
        <dd className="admin-cell-mono">{event.slug}</dd>
      </dl>

      {qrError && <div className="admin-alert admin-alert--err">{qrError}</div>}
      {qrLoading ? (
        <div className="admin-empty">Generating links…</div>
      ) : (
        qrs && (
          <>
            <QrBlock title="Signup" link={qrs.signup} downloadName={`${event.slug}-signup-qr.png`} />
            {qrs.feedback ? (
              <QrBlock title="Feedback survey" link={qrs.feedback} downloadName={`${event.slug}-feedback-qr.png`} />
            ) : (
              <div style={{ marginTop: 14 }}>
                <SectionLabel>Feedback survey</SectionLabel>
                <div className="admin-empty">No survey linked yet — pick one in Settings on the event page.</div>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-cell-muted" style={{ marginBottom: 6, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </div>
  );
}

function QrBlock({ title, link, downloadName }: { title: string; link: QrLink; downloadName: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginTop: 14 }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={link.png}
          alt={`QR code for ${link.url}`}
          width={96}
          height={96}
          style={{ borderRadius: 8, border: "1px solid var(--admin-line)" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <code className="admin-cell-mono" style={{ wordBreak: "break-all" }}>
            {link.url}
          </code>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="admin-btn"
              onClick={async () => {
                await navigator.clipboard.writeText(link.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a className="admin-btn" href={link.png} download={downloadName}>
              Download PNG
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
