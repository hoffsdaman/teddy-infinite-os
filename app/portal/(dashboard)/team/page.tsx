import type { ReactNode } from "react";
import { requirePortalMember } from "@/lib/portal-auth";
import { getAssignedTeam, type PortalTeamMember } from "@/lib/portal/team";
import { PageHead } from "@/components/admin/PageHead";
import { formatDate } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

// Stacked label-over-value, not the shared .admin-kv's side-by-side
// label|value grid. admin-kv's fixed 120px label column leaves too little
// room for a value like an email address at this card's width — no ratio
// tweak fixes that in general, since it's squeezing a ~20-character
// unbreakable string into whatever's left after the label column. Stacking
// gives the value the full card width, so it only wraps when it's actually
// too long for that, not because a sibling column ate half the space.
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--admin-ink)", overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function address(m: PortalTeamMember): string | null {
  return [m.city, m.stateProvince, m.country].filter(Boolean).join(", ") || null;
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const size = 48;
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--admin-accent-soft)",
        color: "var(--admin-accent-strong)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: 16,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

// Client-facing team roster: the Edge8 staff dedicated to this client, scoped
// through company_os.staff_assignments. Directory-safe fields only — see
// lib/portal/team.ts for the column contract (no balances, no employee_number,
// no manager chain).
export default async function PortalTeamPage() {
  const actor = await requirePortalMember();
  const team = await getAssignedTeam(actor);

  return (
    <>
      <PageHead eyebrow="Client Portal" title="Team" sub="Your dedicated Edge8 team." />

      {team.length === 0 ? (
        <div className="admin-card admin-section-card">
          <div className="admin-empty">No dedicated staff assigned yet.</div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            // auto-fit (not the shared .admin-kpi-grid's auto-fill) so these
            // profile cards share the full row width when there are fewer
            // than would fit at the minimum — auto-fill instead leaves empty
            // trailing tracks and pins every card to the 212px floor, which
            // also starves the admin-kv dt/dd grid inside each card down to
            // a near-zero value column.
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            alignItems: "stretch", // cards in a row match the tallest one instead of each sizing to its own content
            gap: 16,
            marginBottom: 20,
          }}
        >
          {team.map((m) => {
            const name = m.fullName || "Team member";
            const addr = address(m);
            return (
              // marginTop: 0 cancels the global `.admin-section-card + .admin-section-card`
              // stacking margin, which otherwise pushes every card after the first
              // 16px down inside its stretched grid track (staggered, unequal cards).
              <div className="admin-card admin-section-card" style={{ marginTop: 0 }} key={m.teamMemberId}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <Avatar name={name} avatarUrl={m.avatarUrl} />
                  <h2 className="admin-card-title" style={{ margin: 0 }}>{name}</h2>
                </div>
                <Field label="Role" value={m.roleTitle || m.positionTitle || "—"} />
                <Field
                  label="Email"
                  value={m.email ? <a href={`mailto:${m.email}`}>{m.email}</a> : "—"}
                />
                <Field
                  label="Phone"
                  value={m.phone ? <a href={`tel:${m.phone}`}>{m.phone}</a> : "—"}
                />
                <Field label="Address" value={addr || m.location || "—"} />
                <Field label="Schedule" value={m.workSchedule || "—"} />
                {m.startDate && <Field label="With you since" value={formatDate(m.startDate)} />}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
