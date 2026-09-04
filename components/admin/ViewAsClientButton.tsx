"use client";

import { useState, useTransition } from "react";
import { startAssumeSession } from "@/app/admin/(dashboard)/settings/assume/actions";

// Shortcut onto the same Assume flow as Settings → Assume, for when you're
// already looking at this company's admin page and just want to jump into
// its portal view.
export function ViewAsClientButton({ companyId }: { companyId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    start(async () => {
      const res = await startAssumeSession(companyId);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <span className="u-row">
      <button className="admin-btn admin-btn--sm" disabled={pending} onClick={handleClick}>
        {pending ? "Opening…" : "View as client"}
      </button>
      {error && <span className="admin-cell-muted">{error}</span>}
    </span>
  );
}
