"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { SaveResult } from "../actions";

// The contract-start form used to be a plain server-action <form> with a static
// "Save" button: no pending state, no confirmation, and DB errors swallowed. This
// wraps it with useFormState/useFormStatus so the admin gets "Saving…", a "Saved ✓"
// confirmation, and a visible error if the write fails.

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-secondary" disabled={pending} style={{ padding: "4px 10px", fontSize: 12 }}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function ContractStartForm({
  action,
  defaultValue,
}: {
  action: (prev: SaveResult | null, formData: FormData) => Promise<SaveResult>;
  defaultValue: string;
}) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="date" name="contract_start_date" defaultValue={defaultValue} style={{ fontSize: 13 }} />
      <SubmitButton />
      {state?.ok && (
        <span className="admin-cell-muted" style={{ fontSize: 12 }}>
          Saved ✓
        </span>
      )}
      {state && !state.ok && (
        <span style={{ color: "var(--admin-danger)", fontSize: 12 }}>{state.error}</span>
      )}
    </form>
  );
}
