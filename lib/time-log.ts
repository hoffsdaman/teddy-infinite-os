// Server-only data layer for Log Time (public/plans/log-time.html). NEVER
// import from a client component.
//
// An admin "tracks time" when admins.tracks_time is true and the row is linked
// to a person (time_entries hang off people, which outlasts admin access). All
// reads/writes go through the service-role client; the checks here — own
// entries only, 7-day edit window, super admins for everyone's — are the
// authorization boundary, called from the server actions after requireAdmin().

import { cache } from "react";
import { companyOs } from "@/lib/supabase";
import { sensitiveEnvAllowlist } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/email";
import { personName } from "@/lib/people-name";
import { DEFAULT_TIME_ZONE, formatDay, dayKey, formatTime, type ShiftEditView } from "@/lib/time-log-format";

export type TimeTracker = { email: string; personId: string; name: string; timeZone: string };

export type TimeEntry = {
  id: string;
  personId: string;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  editedAt: string | null;
};

export type TimeEntryEdit = {
  id: string;
  timeEntryId: string;
  editedByEmail: string;
  oldStartedAt: string;
  oldEndedAt: string | null;
  newStartedAt: string;
  newEndedAt: string | null;
  reason: string;
  createdAt: string;
};

type Result = { ok: true } | { ok: false; error: string };

// A shift open this long is treated as forgotten: it must be closed before a
// new one can start.
export const STALE_SHIFT_MS = 14 * 60 * 60 * 1000;
// How far back a tracker may edit their own shifts.
export const SELF_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Small allowance for clock skew between the browser and the server.
const FUTURE_SLACK_MS = 2 * 60 * 1000;

const ENTRY_COLS = "id, person_id, started_at, ended_at, note, edited_at";

type EntryRow = {
  id: string;
  person_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  edited_at: string | null;
};

function toEntry(r: EntryRow): TimeEntry {
  return {
    id: r.id,
    personId: r.person_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    note: r.note,
    editedAt: r.edited_at,
  };
}

type TrackerRow = {
  email: string;
  display_name: string | null;
  person_id: string | null;
  time_zone: string | null;
  people: { display_name: string | null; preferred_name: string | null; full_name: string | null } | null;
};

function toTracker(r: TrackerRow): TimeTracker | null {
  if (!r.person_id) return null;
  return {
    email: r.email.toLowerCase(),
    personId: r.person_id,
    name: r.people ? personName({ ...r.people, email: r.email }) : r.display_name || r.email,
    timeZone: r.time_zone || DEFAULT_TIME_ZONE,
  };
}

const TRACKER_COLS =
  "email, display_name, person_id, time_zone, people:person_id(display_name, preferred_name, full_name)";

// The signed-in admin's tracker record, or null if they don't track time. Any
// error (including the columns not existing before the migration is applied)
// reads as "doesn't track time" — fail closed, the UI just stays hidden.
export const getTimeTracker = cache(async (email: string | null | undefined): Promise<TimeTracker | null> => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await companyOs
    .from("admins")
    .select(TRACKER_COLS)
    .eq("email", normalized)
    .eq("tracks_time", true)
    .maybeSingle();
  if (error || !data) return null;
  return toTracker(data as unknown as TrackerRow);
});

// Everyone who tracks time, for the super-admin team view.
export async function listTimeTrackers(): Promise<TimeTracker[]> {
  const { data, error } = await companyOs.from("admins").select(TRACKER_COLS).eq("tracks_time", true);
  if (error || !data) return [];
  return (data as unknown as TrackerRow[])
    .map(toTracker)
    .filter((t): t is TimeTracker => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getOpenEntry(personId: string): Promise<TimeEntry | null> {
  const { data, error } = await companyOs
    .from("time_entries")
    .select(ENTRY_COLS)
    .eq("person_id", personId)
    .is("ended_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return toEntry(data as EntryRow);
}

// Shifts that started in [from, to), newest first.
export async function listEntries(personId: string, from: Date, to: Date): Promise<TimeEntry[]> {
  const { data, error } = await companyOs
    .from("time_entries")
    .select(ENTRY_COLS)
    .eq("person_id", personId)
    .gte("started_at", from.toISOString())
    .lt("started_at", to.toISOString())
    .order("started_at", { ascending: false });
  if (error || !data) return [];
  return (data as EntryRow[]).map(toEntry);
}

export async function listEdits(entryIds: string[]): Promise<TimeEntryEdit[]> {
  if (entryIds.length === 0) return [];
  const { data, error } = await companyOs
    .from("time_entry_edits")
    .select("*")
    .in("time_entry_id", entryIds)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    timeEntryId: r.time_entry_id,
    editedByEmail: r.edited_by_email,
    oldStartedAt: r.old_started_at,
    oldEndedAt: r.old_ended_at,
    newStartedAt: r.new_started_at,
    newEndedAt: r.new_ended_at,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

function inFuture(d: Date): boolean {
  return d.getTime() > Date.now() + FUTURE_SLACK_MS;
}

export async function startShift(tracker: TimeTracker, startedAt: Date): Promise<Result> {
  if (inFuture(startedAt)) return { ok: false, error: "The start time can't be in the future." };
  if (Date.now() - startedAt.getTime() > STALE_SHIFT_MS) {
    return { ok: false, error: "That start time is too far back. Start the shift now and fix the time from My time." };
  }
  const open = await getOpenEntry(tracker.personId);
  if (open) return { ok: false, error: "You're already on shift." };

  const { error } = await companyOs
    .from("time_entries")
    .insert({ person_id: tracker.personId, started_at: startedAt.toISOString() });
  if (error) {
    // The one-open-shift-per-person index: a second tab got there first.
    if (error.code === "23505") return { ok: false, error: "You're already on shift." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function endShift(tracker: TimeTracker, endedAt: Date, note: string): Promise<Result> {
  const open = await getOpenEntry(tracker.personId);
  if (!open) return { ok: false, error: "You're not on shift." };
  if (inFuture(endedAt)) return { ok: false, error: "The end time can't be in the future." };
  if (endedAt.getTime() <= new Date(open.startedAt).getTime()) {
    return { ok: false, error: "The end time must be after the start time." };
  }
  const { error } = await companyOs
    .from("time_entries")
    .update({ ended_at: endedAt.toISOString(), note: note.trim() || null })
    .eq("id", open.id)
    .is("ended_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Super-admin emails: the SENSITIVE_VIEWERS env allowlist plus every
// admins.can_view_sensitive row — the same set isSuperAdmin() accepts.
async function superAdminEmails(): Promise<string[]> {
  const emails = new Set(sensitiveEnvAllowlist());
  const { data } = await companyOs.from("admins").select("email").eq("can_view_sensitive", true);
  for (const r of data ?? []) if (r.email) emails.add(String(r.email).toLowerCase());
  return [...emails];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Edits a closed shift's times. `actor` is who is editing; `asSuperAdmin`
// lifts the own-entries and 7-day limits. Every edit needs a reason, is kept
// in time_entry_edits, and — when the tracker edits their own shift — emails
// every super admin.
export async function editEntry(opts: {
  actorEmail: string;
  actorPersonId: string | null;
  asSuperAdmin: boolean;
  entryId: string;
  startedAt: Date;
  endedAt: Date;
  reason: string;
  origin: string;
}): Promise<Result> {
  const reason = opts.reason.trim();
  if (!reason) return { ok: false, error: "Add a reason for the change." };

  const { data, error } = await companyOs.from("time_entries").select(ENTRY_COLS).eq("id", opts.entryId).maybeSingle();
  if (error || !data) return { ok: false, error: "Shift not found." };
  const entry = toEntry(data as EntryRow);

  if (!opts.asSuperAdmin) {
    if (entry.personId !== opts.actorPersonId) return { ok: false, error: "You can only edit your own shifts." };
    if (Date.now() - new Date(entry.startedAt).getTime() > SELF_EDIT_WINDOW_MS) {
      return { ok: false, error: "Shifts older than 7 days can only be changed by a super admin." };
    }
  }
  if (!entry.endedAt) return { ok: false, error: "End the shift before editing it." };
  if (inFuture(opts.startedAt) || inFuture(opts.endedAt)) {
    return { ok: false, error: "Times can't be in the future." };
  }
  if (opts.endedAt.getTime() <= opts.startedAt.getTime()) {
    return { ok: false, error: "The end time must be after the start time." };
  }
  const newStart = opts.startedAt.toISOString();
  const newEnd = opts.endedAt.toISOString();
  if (
    new Date(entry.startedAt).getTime() === opts.startedAt.getTime() &&
    new Date(entry.endedAt).getTime() === opts.endedAt.getTime()
  ) {
    return { ok: false, error: "Nothing changed." };
  }

  const editedAt = new Date().toISOString();
  const { error: uErr } = await companyOs
    .from("time_entries")
    .update({ started_at: newStart, ended_at: newEnd, edited_at: editedAt })
    .eq("id", entry.id);
  if (uErr) return { ok: false, error: uErr.message };

  const { error: hErr } = await companyOs.from("time_entry_edits").insert({
    time_entry_id: entry.id,
    edited_by_email: opts.actorEmail,
    old_started_at: entry.startedAt,
    old_ended_at: entry.endedAt,
    new_started_at: newStart,
    new_ended_at: newEnd,
    reason,
  });
  if (hErr) console.error("[time-log] edit history insert failed:", hErr.message);

  if (!opts.asSuperAdmin) {
    await notifySuperAdmins({ entry, newStart, newEnd, reason, origin: opts.origin });
  }
  return { ok: true };
}

async function notifySuperAdmins(opts: {
  entry: TimeEntry;
  newStart: string;
  newEnd: string;
  reason: string;
  origin: string;
}): Promise<void> {
  const { data } = await companyOs
    .from("admins")
    .select(TRACKER_COLS)
    .eq("person_id", opts.entry.personId)
    .maybeSingle();
  const tracker = data ? toTracker(data as unknown as TrackerRow) : null;
  const tz = tracker?.timeZone ?? DEFAULT_TIME_ZONE;
  const name = tracker?.name ?? "Someone";
  const day = formatDay(dayKey(opts.entry.startedAt, tz));

  const change = (label: string, before: string, after: string) =>
    before === after ? `${label} unchanged (${after})` : `${label} changed from ${before} to ${after}`;
  const startLine = change("Start", formatTime(opts.entry.startedAt, tz), formatTime(opts.newStart, tz));
  const endLine = change("End", formatTime(opts.entry.endedAt!, tz), formatTime(opts.newEnd, tz));

  const day0 = dayKey(opts.entry.startedAt, tz);
  const link = `${opts.origin}/admin/time/team?person=${opts.entry.personId}&from=${day0}&to=${day0}`;
  const html = `
    <p>${escapeHtml(name)} edited a shift on ${escapeHtml(day)}.</p>
    <p>${escapeHtml(startLine)}.<br>${escapeHtml(endLine)}.</p>
    <p>Reason: “${escapeHtml(opts.reason)}”</p>
    <p><a href="${link}">View in Team time →</a></p>
    <p>TeddyBed OS</p>
  `.trim();

  const to = await superAdminEmails();
  if (to.length === 0) return;
  await sendTransactionalEmail({
    to,
    subject: `${name} edited a shift (${day})`,
    html,
    logMeta: { source: "time-log-edit" },
  });
}

// Edit history as display rows, keyed by shift, in the owner's timezone.
export async function editViewsFor(entryIds: string[], timeZone: string): Promise<Map<string, ShiftEditView[]>> {
  const map = new Map<string, ShiftEditView[]>();
  const fmt = (start: string, end: string | null) =>
    `${formatTime(start, timeZone)}–${end ? formatTime(end, timeZone) : "?"}`;
  for (const e of await listEdits(entryIds)) {
    const list = map.get(e.timeEntryId) ?? [];
    list.push({
      when: `${formatDay(dayKey(e.createdAt, timeZone))} ${formatTime(e.createdAt, timeZone)}`,
      by: e.editedByEmail,
      change: `${fmt(e.oldStartedAt, e.oldEndedAt)} → ${fmt(e.newStartedAt, e.newEndedAt)}`,
      reason: e.reason,
    });
    map.set(e.timeEntryId, list);
  }
  return map;
}
