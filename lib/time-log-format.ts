// Timezone helpers for Log Time. Pure (no server imports), so the shift pill and
// the edit dialog can use them in the browser too. Times are stored in UTC and
// always shown in the *tracked person's* timezone (admins.time_zone), not the
// viewer's — a super admin in Saigon sees Carla's shift in Manila time.

export const DEFAULT_TIME_ZONE = "Asia/Manila";

function parts(date: Date, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)) {
    out[p.type] = p.value;
  }
  return out;
}

// Milliseconds the zone is ahead of UTC at that instant.
function offsetMs(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// "YYYY-MM-DDTHH:MM" (a datetime-local value) in `timeZone` → UTC Date.
// Returns null for a malformed value.
export function zonedInputToDate(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes so a DST boundary between the guess and the answer resolves.
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

// UTC instant → "YYYY-MM-DDTHH:MM" in `timeZone`, for a datetime-local input.
export function toZonedInput(date: Date | string, timeZone: string): string {
  const p = parts(new Date(date), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// "YYYY-MM-DD" of the instant in `timeZone`. Days and weeks group on this.
export function dayKey(date: Date | string, timeZone: string): string {
  const p = parts(new Date(date), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

// Monday of the week containing `day` ("YYYY-MM-DD"), as "YYYY-MM-DD".
export function weekStartKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatTime(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(date),
  );
}

// "Mon 26 Oct" for a "YYYY-MM-DD" key.
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

// "8h 05m" / "45m".
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// Short label for the zone, e.g. "Manila time".
export function zoneLabel(timeZone: string): string {
  const city = timeZone.split("/").pop() ?? timeZone;
  return `${city.replace(/_/g, " ")} time`;
}

// ── Log view model ─────────────────────────────────────────────────────────
// Shifts grouped into Monday-start weeks (in the tracked person's timezone),
// newest first, with display strings precomputed so the table component can
// stay dumb. Shared by My time and Team time.

export type ShiftInput = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  editedAt: string | null;
};

export type ShiftEditView = { when: string; by: string; change: string; reason: string };

export type ShiftRow = {
  id: string;
  day: string;
  start: string;
  end: string;
  duration: string;
  live: boolean;
  note: string | null;
  canEdit: boolean;
  startInput: string;
  endInput: string;
  edited: boolean;
  edits: ShiftEditView[];
};

export type ShiftWeek = { label: string; total: string; rows: ShiftRow[] };

export function buildWeeks(
  entries: ShiftInput[],
  timeZone: string,
  opts: { now: number; canEdit: (e: ShiftInput) => boolean; edits?: Map<string, ShiftEditView[]> },
): ShiftWeek[] {
  const weeks = new Map<string, { totalMs: number; rows: ShiftRow[] }>();
  for (const e of entries) {
    const day = dayKey(e.startedAt, timeZone);
    const wk = weekStartKey(day);
    const ms = (e.endedAt ? new Date(e.endedAt).getTime() : opts.now) - new Date(e.startedAt).getTime();
    const bucket = weeks.get(wk) ?? { totalMs: 0, rows: [] };
    bucket.totalMs += ms;
    bucket.rows.push({
      id: e.id,
      day: formatDay(day),
      start: formatTime(e.startedAt, timeZone),
      end: e.endedAt ? formatTime(e.endedAt, timeZone) : "—",
      duration: e.endedAt ? formatDuration(ms) : "live",
      live: !e.endedAt,
      note: e.note,
      canEdit: Boolean(e.endedAt) && opts.canEdit(e),
      startInput: toZonedInput(e.startedAt, timeZone),
      endInput: e.endedAt ? toZonedInput(e.endedAt, timeZone) : "",
      edited: Boolean(e.editedAt),
      edits: opts.edits?.get(e.id) ?? [],
    });
    weeks.set(wk, bucket);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([wk, b]) => ({
      label: `${formatDay(wk)} – ${formatDay(addDays(wk, 6))}`,
      total: formatDuration(b.totalMs),
      rows: b.rows,
    }));
}
