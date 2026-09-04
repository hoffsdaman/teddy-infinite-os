"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  inviteToPortal,
  resendPortalInvite,
  revokePortalAccess,
} from "@/app/admin/(dashboard)/talent/team/actions";
import type { PortalStatus } from "@/lib/admin/portal-status";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Talent > Team portal-access control, three states:
//   none    → an Invite button (confirms first — it emails a real sign-in link)
//   invited → an "Invited" badge + a Resend link (they haven't signed in yet)
//   active  → a "Signed in" badge
// `full` (the member detail page) adds a Revoke button to the linked states.
export function InvitePortalButton({
  teamMemberId,
  status,
  full = false,
}: {
  teamMemberId: string;
  status: PortalStatus;
  full?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run(confirmText: string, action: (id: string) => Promise<Result>) {
    if (!window.confirm(confirmText)) return;
    setMsg(null);
    start(async () => {
      const res = await action(teamMemberId);
      setMsg(res.ok ? res.message : res.error);
      if (res.ok) router.refresh();
    });
  }

  if (status === "none") {
    return (
      <span className="u-row">
        <button
          className="admin-btn admin-btn--sm"
          disabled={pending}
          onClick={() => run("Send this person a portal sign-in invite by email?", inviteToPortal)}
        >
          {pending ? "Sending…" : "Invite"}
        </button>
        {msg && <span className="admin-cell-muted">{msg}</span>}
      </span>
    );
  }

  const badge =
    status === "active" ? (
      <span className="admin-badge admin-badge--ok">Signed in</span>
    ) : (
      <span className="admin-badge admin-badge--info">Invited</span>
    );

  const resend = (
    <button
      className="admin-btn admin-btn--sm"
      disabled={pending}
      onClick={() => run("Email this person a fresh sign-in link?", resendPortalInvite)}
    >
      {pending ? "Sending…" : "Resend link"}
    </button>
  );

  // Compact list row: badge, plus a Resend affordance for the invited (not-yet
  // -signed-in) state so an admin can nudge them without opening the detail.
  if (!full) {
    return (
      <span className="u-row u-wrap">
        {badge}
        {status === "invited" && resend}
        {msg && <span className="admin-cell-muted">{msg}</span>}
      </span>
    );
  }

  return (
    <span className="u-row u-wrap">
      {badge}
      {resend}
      <button
        className="admin-btn admin-btn--sm admin-btn--danger"
        disabled={pending}
        onClick={() =>
          run(
            "Revoke portal access? They are signed out and blocked until re-invited.",
            revokePortalAccess,
          )
        }
      >
        Revoke
      </button>
      {msg && <span className="admin-cell-muted">{msg}</span>}
    </span>
  );
}
