"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, isSuperAdmin } from "@/lib/admin-auth";
import { getSiteOrigin } from "@/lib/site-origin";
import { companyOs } from "@/lib/supabase";
import { editEntry, endShift, getTimeTracker, startShift } from "@/lib/time-log";
import { DEFAULT_TIME_ZONE, zonedInputToDate } from "@/lib/time-log-format";

type Result = { ok: true } | { ok: false; error: string };

// Times arrive as datetime-local strings ("YYYY-MM-DDTHH:MM") in the tracked
// person's timezone and are converted to UTC here, never in the browser.

export async function startShiftAction(startLocal: string): Promise<Result> {
  const admin = await requireAdmin();
  const tracker = await getTimeTracker(admin.email);
  if (!tracker) return { ok: false, error: "Time logging isn't turned on for your account." };
  const startedAt = zonedInputToDate(startLocal, tracker.timeZone);
  if (!startedAt) return { ok: false, error: "Pick a start time." };
  const res = await startShift(tracker, startedAt);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function endShiftAction(endLocal: string, note: string): Promise<Result> {
  const admin = await requireAdmin();
  const tracker = await getTimeTracker(admin.email);
  if (!tracker) return { ok: false, error: "Time logging isn't turned on for your account." };
  const endedAt = zonedInputToDate(endLocal, tracker.timeZone);
  if (!endedAt) return { ok: false, error: "Pick an end time." };
  const res = await endShift(tracker, endedAt, note);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

// Used by both My time (the tracker, own shifts, last 7 days) and Team time
// (super admins, any shift). The times are read in the shift owner's timezone.
export async function editEntryAction(
  entryId: string,
  startLocal: string,
  endLocal: string,
  reason: string,
): Promise<Result> {
  const admin = await requireAdmin();
  const [superAdmin, tracker] = await Promise.all([isSuperAdmin(admin.email), getTimeTracker(admin.email)]);
  if (!superAdmin && !tracker) return { ok: false, error: "Time logging isn't turned on for your account." };

  const { data: entry } = await companyOs.from("time_entries").select("person_id").eq("id", entryId).maybeSingle();
  if (!entry) return { ok: false, error: "Shift not found." };
  const { data: owner } = await companyOs
    .from("admins")
    .select("time_zone")
    .eq("person_id", entry.person_id)
    .maybeSingle();
  const tz = (owner?.time_zone as string | undefined) || DEFAULT_TIME_ZONE;

  const startedAt = zonedInputToDate(startLocal, tz);
  const endedAt = zonedInputToDate(endLocal, tz);
  if (!startedAt || !endedAt) return { ok: false, error: "Pick a start and an end time." };

  // A super admin editing their own shift still counts as a super admin edit.
  const res = await editEntry({
    actorEmail: admin.email,
    actorPersonId: tracker?.personId ?? null,
    asSuperAdmin: superAdmin,
    entryId,
    startedAt,
    endedAt,
    reason,
    origin: getSiteOrigin(),
  });
  if (res.ok) revalidatePath("/admin/time", "layout");
  return res;
}
