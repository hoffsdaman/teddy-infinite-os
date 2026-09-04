"use client";

import { useState, useTransition } from "react";
import { sendReviewNow } from "../actions";

// "Send Review Now" on the talent profile: pick a review type and open the
// cycle immediately (self + manager rows), emailing both. Defaults to the
// member's next scheduled type so the common case is one click. The action
// re-authorizes (requireAdmin) and is idempotent per cycle label.

type ReviewType = "probation" | "midyear" | "renewal" | "adhoc";

const TYPE_OPTIONS: { value: ReviewType; label: string }[] = [
  { value: "probation", label: "Probation review" },
  { value: "midyear", label: "Mid-year check-in" },
  { value: "renewal", label: "Renewal review" },
  { value: "adhoc", label: "Ad-hoc review" },
];

export function SendReviewButton({
  teamMemberId,
  defaultType,
}: {
  teamMemberId: string;
  defaultType: ReviewType;
}) {
  const [type, setType] = useState<ReviewType>(defaultType);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSend() {
    setResult(null);
    startTransition(async () => {
      const res = await sendReviewNow(teamMemberId, type);
      setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ReviewType)}
          disabled={pending}
          style={{ fontSize: 13, padding: "6px 8px" }}
          aria-label="Review type"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={onSend}
          disabled={pending}
        >
          {pending ? "Sending…" : "Send review now"}
        </button>
      </div>
      {result && (
        <span
          style={{
            fontSize: 12,
            color: result.ok ? "var(--admin-muted)" : "var(--admin-danger)",
          }}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
