import { requireSuperAdmin } from "@/lib/admin-auth";
import { PageHead } from "@/components/admin/PageHead";
import { TimeEntryTable } from "@/components/admin/TimeEntryTable";
import { editViewsFor, listEntries, listTimeTrackers } from "@/lib/time-log";
import {
  addDays,
  buildWeeks,
  dayKey,
  formatDuration,
  zonedInputToDate,
  zoneLabel,
} from "@/lib/time-log-format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Team time",
  description: "Logged shifts for everyone who tracks time.",
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Super admins only. Pick a person and a date range (in that person's
// timezone); shows their shifts by week with totals. Super admins can correct
// any shift — with a reason, logged, but no email.
export default async function TeamTimePage({
  searchParams,
}: {
  searchParams: { person?: string; from?: string; to?: string };
}) {
  await requireSuperAdmin();
  const trackers = await listTimeTrackers();
  const tracker = trackers.find((t) => t.personId === searchParams.person) ?? trackers[0] ?? null;

  if (!tracker) {
    return (
      <>
        <PageHead title="Team time" />
        <div className="admin-card admin-empty">
          Nobody tracks time yet. Turn on &ldquo;Tracks time&rdquo; for someone in Settings → Admins.
        </div>
      </>
    );
  }

  const tz = tracker.timeZone;
  const today = dayKey(new Date(), tz);
  const to = searchParams.to && DAY_RE.test(searchParams.to) ? searchParams.to : today;
  const from = searchParams.from && DAY_RE.test(searchParams.from) ? searchParams.from : addDays(to, -13);

  const fromDate = zonedInputToDate(`${from}T00:00`, tz)!;
  const toDate = zonedInputToDate(`${addDays(to, 1)}T00:00`, tz)!;
  const entries = await listEntries(tracker.personId, fromDate, toDate);
  const editedIds = entries.filter((e) => e.editedAt).map((e) => e.id);
  const edits = await editViewsFor(editedIds, tz);
  const now = Date.now();
  const weeks = buildWeeks(entries, tz, { now, edits, canEdit: () => true });
  const totalMs = entries.reduce(
    (sum, e) => sum + (e.endedAt ? new Date(e.endedAt).getTime() : now) - new Date(e.startedAt).getTime(),
    0,
  );

  return (
    <>
      <PageHead title="Team time" sub={`Shifts in ${tracker.name}'s timezone (${zoneLabel(tz)}).`} />

      <form className="admin-card admin-section-card u-row u-wrap u-gap-3 u-mb-5" method="get">
        <label className="admin-field">
          <span className="admin-label">Person</span>
          <select className="admin-select" name="person" defaultValue={tracker.personId}>
            {trackers.map((t) => (
              <option key={t.personId} value={t.personId}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span className="admin-label">From</span>
          <input className="admin-input" type="date" name="from" defaultValue={from} />
        </label>
        <label className="admin-field">
          <span className="admin-label">To</span>
          <input className="admin-input" type="date" name="to" defaultValue={to} />
        </label>
        <div className="admin-field">
          <span className="admin-label">&nbsp;</span>
          <button type="submit" className="admin-btn admin-btn--primary">
            Show
          </button>
        </div>
      </form>

      <p className="u-mb-4">
        Total <strong>{formatDuration(totalMs)}</strong> · {entries.length} {entries.length === 1 ? "shift" : "shifts"} ·{" "}
        {editedIds.length} edited
      </p>

      <TimeEntryTable weeks={weeks} zone={zoneLabel(tz)} />
    </>
  );
}
