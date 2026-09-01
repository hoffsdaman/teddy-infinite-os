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
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/support/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, website }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) {
        setStatus({ kind: "ok", ticketNo: body.ticketNo ?? null });
        setName("");
        setEmail("");
        setSubject("");
        setMessage("");
      } else {
        setStatus({ kind: "err", message: body?.error || "Something went wrong. Please try again." });
      }
    } catch {
      setStatus({ kind: "err", message: "Network error. Please try again." });
    }
  }

  const sending = status.kind === "sending";
  const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 14, fontWeight: 600, color: "var(--dark, #1a1a2e)" };
  const inputStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    fontSize: 15,
    fontFamily: "inherit",
    width: "100%",
    background: "#fff",
    color: "#1a1a2e",
  };

  if (status.kind === "ok") {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 22 }}>Thanks — we&rsquo;ve got it.</h3>
        <p style={{ margin: 0, color: "rgba(0,0,0,0.6)" }}>
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
          className="btn"
          style={{ marginTop: 20, background: "transparent", border: "1px solid rgba(0,0,0,0.2)", padding: "10px 20px", borderRadius: 40, cursor: "pointer" }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      style={{ background: "#fff", borderRadius: 16, padding: "28px", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", display: "grid", gap: 16 }}
    >
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <label style={labelStyle}>
          Your name
          <input style={inputStyle} type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Email <span style={{ color: "#d33" }}>*</span>
          <input style={inputStyle} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <label style={labelStyle}>
        Subject <span style={{ color: "#d33" }}>*</span>
        <input style={inputStyle} type="text" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mattress warranty question" />
      </label>
      <label style={labelStyle}>
        How can we help? <span style={{ color: "#d33" }}>*</span>
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={6} required value={message} onChange={(e) => setMessage(e.target.value)} />
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
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      {status.kind === "err" && (
        <div style={{ background: "rgba(211,51,51,0.1)", color: "#a11", padding: "10px 14px", borderRadius: 10, fontSize: 14 }}>
          {status.message}
        </div>
      )}
      <div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={sending}
          style={{ padding: "13px 32px", borderRadius: 40, fontWeight: 700, fontSize: 15, cursor: sending ? "default" : "pointer", opacity: sending ? 0.7 : 1 }}
        >
          {sending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
