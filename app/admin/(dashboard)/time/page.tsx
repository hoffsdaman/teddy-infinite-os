import { requireAdmin } from "@/lib/admin-auth";
import { PageHead } from "@/components/admin/PageHead";
import { TimeEntryTable } from "@/components/admin/TimeEntryTable";
import { editViewsFor, getTimeTracker, listEntries, SELF_EDIT_WINDOW_MS } from "@/lib/time-log";
import { buildWeeks, zoneLabel } from "@/lib/time-log-format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My time",
  description: "Your logged shifts, by week.",
};

// How much history My time shows.
const HISTORY_DAYS = 56;

export default async function MyTimePage() {
  const admin = await requireAdmin();
  const tracker = await getTimeTracker(admin.email);

  if (!tracker) {
    return (
      <>
        <PageHead title="My time" />
        <div className="admin-card admin-empty">Time logging isn&apos;t turned on for your account.</div>
      </>
    );
  }

  const now = Date.now();
  const entries = await listEntries(tracker.personId, new Date(now - HISTORY_DAYS * 86_400_000), new Date(now + 86_400_000));
  const edits = await editViewsFor(
    entries.filter((e) => e.editedAt).map((e) => e.id),
    tracker.timeZone,
  );
  const weeks = buildWeeks(entries, tracker.timeZone, {
    now,
    edits,
    canEdit: (e) => now - new Date(e.startedAt).getTime() <= SELF_EDIT_WINDOW_MS,
  });

  return (
    <>
      <PageHead
        title="My time"
        sub={`Your shifts for the last 8 weeks, in ${zoneLabel(tracker.timeZone)}. You can fix shifts from the last 7 days; each change needs a reason and super admins are told.`}
      />
      <TimeEntryTable weeks={weeks} zone={zoneLabel(tracker.timeZone)} />
    </>
  );
}
