"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reopenTicketAsCustomer } from "./actions";

// Matches REOPEN_REASON_MIN in actions.ts.
const REOPEN_REASON_MIN = 5;

export function ReopenForm({ token }: { token: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length >= REOPEN_REASON_MIN;

  if (!open) {
    return (
      <div className="u-center-text">
        <p className="site-muted u-m-0 u-mb-4">Something still not right?</p>
        <button type="button" className="btn site-btn-ghost" onClick={() => setOpen(true)}>
          Reopen this ticket
        </button>
      </div>
    );
  }

  return (
    <form
      className="u-stack u-gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        setError(null);
        const res = await reopenTicketAsCustomer(token, reason);
        setBusy(false);
        if (!res.ok) {
          setError(res.error ?? "Something went wrong.");
          return;
        }
        router.refresh();
      }}
    >
      <label className="site-label">
        What&rsquo;s still wrong? <span className="site-req">*</span>
        <textarea
          className="site-input site-textarea"
          rows={4}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. The replacement cover arrived but it's the wrong size"
        />
      </label>
      {error && <div className="site-form-error">{error}</div>}
      <div className="u-row u-wrap">
        <button type="submit" className="btn btn-primary site-btn-submit" disabled={busy || !ready}>
          {busy ? "Reopening…" : "Reopen ticket"}
        </button>
        <button type="button" className="btn site-btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
