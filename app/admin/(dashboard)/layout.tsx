import type { Metadata } from "next";
import { requireAdmin, isSuperAdmin, isSupportOnlyAdmin } from "@/lib/admin-auth";
import { hasTeamAccess } from "@/lib/team-auth";
import { avatarUrlForAuthUser } from "@/lib/avatars";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminChatWidget } from "@/components/admin/AdminChatWidget";
import { ShiftBar } from "@/components/admin/ShiftBar";
import { getOpenEntry, getTimeTracker, STALE_SHIFT_MS } from "@/lib/time-log";
import { isPrivilegedChatUser } from "@/lib/admin-chat/privileged";
import "../admin.css";
import "@/app/styles/utilities.css";

export const metadata: Metadata = {
  title: { template: "%s · TeddyBed OS", default: "TeddyBed OS" },
  description: "TeddyBed OS — the internal admin for contacts, revenue, talent, and operations.",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const [canSwitchToTeam, avatarUrl, superAdmin, supportOnly, tracker] = await Promise.all([
    hasTeamAccess(user.id),
    avatarUrlForAuthUser(user.id),
    isSuperAdmin(user.email),
    isSupportOnlyAdmin(user.email),
    getTimeTracker(user.email),
  ]);
  const openShift = tracker ? await getOpenEntry(tracker.personId) : null;

  return (
    <div className="admin-shell">
      <AdminSidebar
        user={user}
        avatarUrl={avatarUrl}
        canSwitchToTeam={canSwitchToTeam}
        isSuperAdmin={superAdmin}
        isSupportOnly={supportOnly}
        tracksTime={Boolean(tracker)}
      />
      <main className="admin-main">
        {tracker && (
          <ShiftBar
            timeZone={tracker.timeZone}
            open={openShift ? { startedAt: openShift.startedAt } : null}
            stale={Boolean(openShift && Date.now() - new Date(openShift.startedAt).getTime() > STALE_SHIFT_MS)}
          />
        )}
        {children}
      </main>
      <AdminChatWidget canWrite={isPrivilegedChatUser(user.email)} />
    </div>
  );
}
