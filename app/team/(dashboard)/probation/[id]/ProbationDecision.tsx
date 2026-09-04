"use client";

import { useState, useTransition } from "react";
import { recordProbationDecisionAction } from "./actions";

// The three probation decisions. Labels match DECISION_BY_CHOICE exactly.
const CHOICES: { choice: string; label: string; hint: string; danger?: boolean }[] = [
  {
    choice: "Offer full time contract",
    label: "Offer full time",
    hint: "They are promoted to full time when probation ends.",
  },
  {
    choice: "Extend probation 30 days",
    label: "Extend probation 30 days",
    hint: "Probation end and contract start move out 30 days automatically.",
  },
  {
    choice: "Terminate employee",
    label: "Terminate",
    hint: "The talent director is notified to run offboarding. Nothing is automated.",
    danger: true,
  },
];

export function ProbationDecision({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(choice: string) {
    setResult(null);
    startTransition(async () => {
      const res = await recordProbationDecisionAction(subjectId, choice);
      setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
      setConfirm(null);
    });
  }

  if (result?.ok) {
    return (
      <div className="admin-alert admin-alert--ok" style={{ marginTop: 4 }}>
        {result.message}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {CHOICES.map((c) => (
        <div key={c.choice} className="admin-card" style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
              <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{c.hint}</div>
            </div>
            {confirm === c.choice ? (
              <div style={{ display: "flex", gap: 8, flex: "none" }}>
                <button
                  type="button"
                  className={`admin-btn${c.danger ? "" : " admin-btn--primary"}`}
                  onClick={() => decide(c.choice)}
                  disabled={pending}
                >
                  {pending ? "Recording…" : "Confirm"}
                </button>
                <button type="button" className="admin-btn" onClick={() => setConfirm(null)} disabled={pending}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="admin-btn"
                style={{ flex: "none" }}
                onClick={() => setConfirm(c.choice)}
                disabled={pending}
              >
                Choose
              </button>
            )}
          </div>
        </div>
      ))}
      {result && !result.ok && (
        <div className="admin-alert admin-alert--err">{result.message}</div>
      )}
      <p style={{ fontSize: 12, color: "var(--admin-muted)", margin: "2px 0 0" }}>
        Recording a decision for {subjectName} takes effect immediately.
      </p>
    </div>
  );
}
