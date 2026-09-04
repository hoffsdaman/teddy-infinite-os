import Link from "next/link";
import { Badge } from "@/components/admin/Badge";
import { formatDate } from "@/lib/admin/format";
import type { AdminMeetingRow } from "@/lib/admin/meetings";

// Publish state plus AI state, shared by the List table, the company 360 tab and
// the Details page so one meeting never reads differently in two places.
export function MeetingStatusBadges({ meeting }: { meeting: AdminMeetingRow }) {
  return (
    <span className="u-row u-wrap">
      {meeting.publishedAt ? <Badge tone="ok">Published</Badge> : <Badge tone="neutral">Draft</Badge>}
      {meeting.aiStatus === "pending" && <Badge tone="warn">Summarizing…</Badge>}
      {meeting.aiStatus === "failed" && <Badge tone="warn">AI failed</Badge>}
    </span>
  );
}

// Compact meeting table for the company 360 tab. The global List page renders
// the same columns through DataTable (search + pagination); this one is the
// plain variant for the handful of meetings a single client has.
export function MeetingsTable({ meetings }: { meetings: AdminMeetingRow[] }) {
  if (meetings.length === 0) {
    return <div className="admin-empty">No meetings yet. Use “Add meeting” to upload a transcript.</div>;
  }

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Attendees</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id}>
                <td>{m.meetingDate ? formatDate(m.meetingDate) : <span className="admin-cell-muted">—</span>}</td>
                <td>
                  <Link className="admin-cell-strong" href={`/admin/revenue/meetings/${m.id}`}>
                    {m.title || "Untitled meeting"}
                  </Link>
                </td>
                <td className="admin-cell-muted">{m.attendees.length > 0 ? m.attendees.join(", ") : "—"}</td>
                <td>
                  <MeetingStatusBadges meeting={m} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
