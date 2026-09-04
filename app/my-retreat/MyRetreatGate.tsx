"use client";

import { useState } from "react";

// Two-stage soft gate (copy of the infinite-leverage WorkshopGate posture):
//   1. code     → validate the retreat access code.
//   2. identity → email only ("continue as a Client"); if the email isn't on
//                 file, reveal a name field and unlock as a first-timer.
// On success the API sets the signed cookie and returns the hub URL.

type Stage = "code" | "identity";

export function MyRetreatGate({ initialCode = "" }: { initialCode?: string }) {
  const [stage, setStage] = useState<Stage>("code");
  const [code, setCode] = useState(initialCode);
  const [title, setTitle] = useState<string>("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/my-retreat/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "That access code isn't recognized.");
        return;
      }
      setTitle(data.retreat?.title || "your retreat");
      setStage("identity");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/my-retreat/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, registration: { email, name: needName ? name : undefined } }),
      });
      const data = await res.json();
      if (res.status === 404 && data.needName) {
        setNeedName(true);
        setError("We don't have that email on file. Add your name to continue.");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn't unlock your retreat.");
        return;
      }
      window.location.href = data.redirect;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <h1 style={{ fontSize: 24, margin: "0 0 6px" }}>Enter My Retreat</h1>
      <p style={{ margin: "0 0 18px", opacity: 0.75, fontSize: 15 }}>
        {stage === "code"
          ? "Enter the access code from your retreat invitation."
          : `${title}. Enter your email to continue.`}
      </p>

      {error && <div style={alert}>{error}</div>}

      {stage === "code" ? (
        <form onSubmit={submitCode} style={form}>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            style={input}
            aria-label="Access code"
          />
          <button type="submit" style={button} disabled={busy || !code.trim()}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitIdentity} style={form}>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={input}
            aria-label="Email"
          />
          {needName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              style={input}
              aria-label="Your name"
            />
          )}
          <button type="submit" style={button} disabled={busy || !email.trim() || (needName && !name.trim())}>
            {busy ? "Unlocking…" : "Enter"}
          </button>
        </form>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  maxWidth: 420,
  margin: "0 auto",
  padding: "28px 26px",
  border: "1px solid color-mix(in srgb, var(--dark) 10%, transparent)",
  borderRadius: 14,
  background: "var(--white)",
};
const form: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const input: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 16,
  borderRadius: 10,
  border: "1px solid color-mix(in srgb, var(--dark) 18%, transparent)",
  width: "100%",
  boxSizing: "border-box",
};
const button: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 16,
  borderRadius: 10,
  border: "none",
  background: "var(--dark)",
  color: "var(--white)",
  cursor: "pointer",
};
const alert: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "var(--color-err-bg)",
  color: "var(--color-err-deep)",
  fontSize: 14,
};
