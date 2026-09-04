"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  invitePortalMember,
  resendPortalMemberInvite,
  revokePortalMember,
  setPortalMemberRole,
  setPortalMemberTempPassword,
} from "@/app/admin/(dashboard)/revenue/companies/portal-actions";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Client-portal access controls for one (person, company) pair. Sibling of
// InvitePortalButton (the /team one), but membership-based: Invite confirms
// first (it emails a real sign-in link); an active member gets Resend + Revoke.
export function PortalMemberControls({
  personId,
  companyId,
  active,
  role,
}: {
  personId: string;
  companyId: string;
  active: boolean;
  // Current portal role; picker shown for active members (PR 2 roles).
  role?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  // The generated temp password, shown once after issuing. Held only in this
  // component's state — never refetched — so leaving the row clears it.
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function run(confirmText: string, action: () => Promise<Result>) {
    if (!window.confirm(confirmText)) return;
    setMsg(null);
    start(async () => {
      const res = await action();
      setMsg(res.ok ? res.message : res.error);
      if (res.ok) router.refresh();
    });
  }

  function issueTempPassword() {
    if (
      !window.confirm(
        "Generate a temporary password for this contact and email it to them? They must change it on first sign-in.",
      )
    )
      return;
    setMsg(null);
    setTempPw(null);
    setCopied(false);
    start(async () => {
      const res = await setPortalMemberTempPassword(personId, companyId);
      setMsg(res.ok ? res.message : res.error);
      if (res.ok) {
        setTempPw(res.password);
        router.refresh();
      }
    });
  }

  if (active) {
    return (
      <span className="u-row u-wrap">
        <span className="admin-badge admin-badge--ok">Portal ✓</span>
        <select
          className="admin-select admin-select--sm"
          value={role ?? "admin"}
          disabled={pending}
          aria-label="Portal role"
          onChange={(e) => {
            const next = e.target.value;
            setMsg(null);
            start(async () => {
              const res = await setPortalMemberRole(personId, companyId, next);
              setMsg(res.ok ? res.message : res.error);
              if (res.ok) router.refresh();
            });
          }}
        >
          <option value="admin">Admin</option>
          <option value="contributor">Contributor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          className="admin-btn admin-btn--sm"
          disabled={pending}
          onClick={() =>
            run("Email this contact a fresh sign-in link?", () =>
              resendPortalMemberInvite(personId, companyId),
            )
          }
        >
          Resend link
        </button>
        <button
          className="admin-btn admin-btn--sm"
          disabled={pending}
          onClick={issueTempPassword}
          title="For clients whose mail security eats sign-in links"
        >
          Set temp password
        </button>
        <button
          className="admin-btn admin-btn--sm admin-btn--danger"
          disabled={pending}
          onClick={() =>
            run(
              "Revoke portal access for this company? If it is their last membership they are signed out and blocked until re-invited.",
              () => revokePortalMember(personId, companyId),
            )
          }
        >
          Revoke
        </button>
        {msg && <span className="admin-cell-muted">{msg}</span>}
        {tempPw && (
          <span
            className="admin-alert admin-alert--ok u-w-full u-row u-wrap"
          >
            <span>Temporary password:</span>
            <code className="admin-code">
              {tempPw}
            </code>
            <button
              type="button"
              className="admin-btn admin-btn--sm"
              onClick={() => {
                navigator.clipboard?.writeText(tempPw).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setTempPw(null)}>
              Done
            </button>
            <span className="admin-cell-muted u-w-full">
              Shown once. The client must change it on first sign-in.
            </span>
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="u-row">
      <button
        className="admin-btn admin-btn--sm"
        disabled={pending}
        onClick={() =>
          run("Send this contact a client-portal invite by email?", () =>
            invitePortalMember(personId, companyId),
          )
        }
      >
        {pending ? "Sending…" : "Invite to portal"}
      </button>
      {msg && <span className="admin-cell-muted">{msg}</span>}
    </span>
  );
}
