"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompanyUser } from "@/lib/portal/users";
import {
  inviteUserAction,
  resendUserInviteAction,
  revokeUserAction,
  setUserRoleAction,
} from "./actions";

// Users page for portal admins: list, invite (name + email + role), change
// role, resend link, revoke. The server re-checks every rule; this UI just
// keeps the honest path obvious.

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  contributor: "Contributor",
  viewer: "Viewer",
};

const ROLE_HELP: Record<string, string> = {
  admin: "Everything, including invoices and user management.",
  contributor: "Can propose roadmap items, upload documents, and create requests. No invoices.",
  viewer: "Read-only access.",
};

export function UsersView({
  companyId,
  companyName,
  users,
}: {
  companyId: string;
  companyName: string;
  users: CompanyUser[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) {
    setMsg(null);
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg(r.message ?? "Done.");
        after?.();
        router.refresh();
      } else {
        setErr(r.error ?? "Something went wrong.");
      }
    });
  }

  const active = users.filter((u) => u.membershipStatus === "active");
  const revoked = users.filter((u) => u.membershipStatus !== "active");

  return (
    <div className="admin-card admin-section-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 className="admin-card-title" style={{ margin: 0, flex: 1 }}>{companyName}</h2>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => setShowInvite((v) => !v)}>
          {showInvite ? "Cancel" : "Invite a user"}
        </button>
      </div>

      {showInvite && (
        <div style={{ border: "1px dashed var(--admin-line)", borderRadius: 12, padding: 14, marginBottom: 14, maxWidth: 480 }}>
          <label className="admin-label" htmlFor="inv-name">Name</label>
          <input id="inv-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Chen" disabled={pending} />
          <div style={{ marginTop: 10 }}>
            <label className="admin-label" htmlFor="inv-email">Email</label>
            <input id="inv-email" className="admin-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@yourcompany.com" disabled={pending} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="admin-label" htmlFor="inv-role">Role</label>
            <select id="inv-role" className="admin-select" value={role} onChange={(e) => setRole(e.target.value)} disabled={pending}>
              <option value="admin">Admin</option>
              <option value="contributor">Contributor</option>
              <option value="viewer">Viewer</option>
            </select>
            <div className="admin-cell-muted" style={{ fontSize: 12.5, marginTop: 6 }}>{ROLE_HELP[role]}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={pending || !name.trim() || !email.trim()}
              onClick={() =>
                run(
                  () => inviteUserAction({ companyId, name, email, role }),
                  () => {
                    setShowInvite(false);
                    setName("");
                    setEmail("");
                    setRole("contributor");
                  },
                )
              }
            >
              {pending ? "Sending…" : "Send invite"}
            </button>
          </div>
        </div>
      )}

      <div className="admin-list">
        {active.map((u) => (
          <div className="admin-list-row" key={u.personId}>
            <div className="admin-list-main">
              <div className="admin-list-title">
                {u.name}
                {u.isSelf && <span className="admin-cell-muted"> (you)</span>}
              </div>
              <div className="admin-list-sub">
                {u.email}
                {u.accessStatus === "invited" && " · invited, not signed in yet"}
                {u.accessStatus === "none" && " · not invited yet"}
              </div>
            </div>
            <div className="admin-list-aside" style={{ flexWrap: "wrap" }}>
              {u.isSelf ? (
                <span className="admin-badge">{ROLE_LABEL[u.role] ?? u.role}</span>
              ) : (
                <>
                  <select
                    className="admin-select"
                    style={{ padding: "4px 8px", fontSize: 12.5 }}
                    value={u.role}
                    disabled={pending}
                    aria-label={`Role for ${u.name}`}
                    onChange={(e) => run(() => setUserRoleAction({ companyId, personId: u.personId, role: e.target.value }))}
                  >
                    <option value="admin">Admin</option>
                    <option value="contributor">Contributor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {u.accessStatus === "invited" && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm"
                      disabled={pending}
                      onClick={() => run(() => resendUserInviteAction({ companyId, personId: u.personId }))}
                    >
                      Resend link
                    </button>
                  )}
                  <button
                    type="button"
                    className="admin-btn admin-btn--sm admin-btn--danger"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Remove ${u.name}'s portal access?`)) {
                        run(() => revokeUserAction({ companyId, personId: u.personId }));
                      }
                    }}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {revoked.length > 0 && (
        <>
          <h3 className="admin-section-label" style={{ marginTop: 16 }}>Removed</h3>
          <div className="admin-list">
            {revoked.map((u) => (
              <div className="admin-list-row" key={u.personId}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{u.name}</div>
                  <div className="admin-list-sub">{u.email} · access removed</div>
                </div>
                <div className="admin-list-aside">
                  <button
                    type="button"
                    className="admin-btn admin-btn--sm"
                    disabled={pending}
                    onClick={() => run(() => inviteUserAction({ companyId, name: u.name, email: u.email, role: u.role }))}
                  >
                    Re-invite
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {msg && <div className="admin-alert" style={{ marginTop: 10 }}>{msg}</div>}
      {err && <div className="admin-alert admin-alert--err" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}
