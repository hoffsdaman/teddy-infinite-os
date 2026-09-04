"use client";

import { useState } from "react";

// Public support form. Posts same-origin to /api/support/ (the trailing slash
// matters — next.config trailingSlash:true 308-redirects the slashless URL and
// browsers drop the POST body on a redirect). On success it shows the ticket
// number the endpoint returns; the ticket lands in /admin/support.
type Status = { kind: "idle" | "sending" } | { kind: "ok"; ticketNo: string | null } | { kind: "err"; message: string };

export function SupportForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/support/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, orderNumber, message, website }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) {
        setStatus({ kind: "ok", ticketNo: body.ticketNo ?? null });
        setName("");
        setEmail("");
        setSubject("");
        setOrderNumber("");
        setMessage("");
      } else {
        setStatus({ kind: "err", message: body?.error || "Something went wrong. Please try again." });
      }
    } catch {
      setStatus({ kind: "err", message: "Network error. Please try again." });
    }
  }

  const sending = status.kind === "sending";

  if (status.kind === "ok") {
    return (
      <div
        className="site-form-card u-center-text"
      >
        <div className="site-form-icon u-mb-2">✅</div>
        <h3 className="site-form-h3">Thanks — we&rsquo;ve got it.</h3>
        <p className="site-muted u-m-0">
          {status.ticketNo ? (
            <>
              Your reference is <strong>{status.ticketNo}</strong>. We&rsquo;ll be in touch shortly.
            </>
          ) : (
            <>We&rsquo;ll be in touch shortly.</>
          )}
        </p>
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="btn site-btn-ghost u-mt-5"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="site-form-card u-stack u-gap-4"
    >
      <div className="u-stack u-gap-4 u-grid-2">
        <label className="site-label">
          Your name
          <input className="site-input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="site-label">
          Email <span className="site-req">*</span>
          <input className="site-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <div className="u-stack u-gap-4 u-grid-2">
        <label className="site-label">
          Subject <span className="site-req">*</span>
          <input className="site-input" type="text" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mattress warranty question" />
        </label>
        <label className="site-label">
          Order number <span className="site-optional">(optional)</span>
          <input className="site-input" type="text" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="e.g. 1234" />
        </label>
      </div>
      <label className="site-label">
        How can we help? <span className="site-req">*</span>
        <textarea className="site-input site-textarea" rows={6} required value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      {/* Honeypot — hidden from humans, catches bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        aria-hidden="true"
        className="site-honeypot"
      />
      {status.kind === "err" && (
        <div className="site-form-error">
          {status.message}
        </div>
      )}
      <div>
        <button
          type="submit"
          className="btn btn-primary site-btn-submit"
          disabled={sending}
        >
          {sending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
