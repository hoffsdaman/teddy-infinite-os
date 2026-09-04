"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createManualTicket } from "./actions";

// Manual intake (channel "manual"): the third way a ticket gets onto the board,
// alongside the web form (PR3) and email (PR4). Collapsed to a button until
// needed so it never competes with the ticket list for attention.
export function NewTicketForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerEmail, setEmail] = useState("");
  const [customerName, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await createManualTicket({ customerEmail, customerName, subject, orderNumber, message });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEmail("");
    setName("");
    setSubject("");
    setOrderNumber("");
    setMessage("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
        + New ticket
      </button>
    );
  }

  return (
    <form className="admin-card admin-section-card" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>New ticket</strong>
        <button type="button" className="admin-btn" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </button>
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <label className="admin-field">
          <span className="admin-label">Customer email</span>
          <input
            className="admin-input"
            type="email"
            required
            value={customerEmail}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </label>
        <label className="admin-field">
          <span className="admin-label">Customer name</span>
          <input
            className="admin-input"
            value={customerName}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </label>
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr" }}>
        <label className="admin-field">
          <span className="admin-label">Subject</span>
          <input
            className="admin-input"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Mattress warranty question"
          />
        </label>
        <label className="admin-field">
          <span className="admin-label">Order number</span>
          <input
            className="admin-input"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="1234"
          />
        </label>
      </div>
      <label className="admin-field">
        <span className="admin-label">Message</span>
        <textarea
          className="admin-input"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What does the customer need?"
        />
      </label>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          {saving ? "Creating…" : "Create ticket"}
        </button>
      </div>
    </form>
  );
}
