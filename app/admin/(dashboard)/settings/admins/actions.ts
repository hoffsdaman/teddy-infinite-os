"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { companyOs, supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin/audit";
import { findAdminEmployee, findAuthUser } from "@/lib/admin/admins";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/admin/settings/admins");
}

function siteOrigin(): string {
  const h = headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host");
  return host ? `https://${host}` : "https://teddy-infinite-os.vercel.app";
}

// Send the right email for the account's state: no login yet → Supabase invite
// (creates the auth user, link lets them set a password); existing login →
// password reset. These are generated server-side, so the link comes back via
// the implicit flow with the session in the URL hash (#access_token=…). Land
// straight on /admin/reset-password (which reads the hash) — NOT
// /api/auth/callback, which only handles the PKCE ?code= flow used by the
// browser-initiated login "forgot password" form.
async function sendAccessEmail(email: string): Promise<Result> {
  const redirectTo = `${siteOrigin()}/admin/reset-password`;
  const existing = await findAuthUser(email);
  if (existing) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { ok: false, error: `Reset email failed: ${error.message}` };
    return { ok: true, message: `Password reset link sent to ${email}.` };
  }
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) return { ok: false, error: `Invite failed: ${error.message}` };
  return { ok: true, message: `Invite sent to ${email}.` };
}

// Admins are granted to employees, never free-typed emails. The client sends
// the chosen person's id and the level; email + name are re-resolved from the
// people record server-side, and eligibility (on payroll, not a contractor,
// not already an admin) is re-checked here — findAdminEmployee returns null
// otherwise.
export async function addAdmin(personId: string, canViewSensitive: boolean): Promise<Result> {
  const admin = await requireAdmin();

  const employee = await findAdminEmployee(personId);
  if (!employee) {
    return { ok: false, error: "Pick an active employee from the list (contractors and current admins are excluded)." };
  }
  return grantAdmin(employee.email, employee.name, personId, canViewSensitive, admin.email);
}

// Insert the admins row for an already-resolved person, audit it, and send the
// access email. Shared by both Add paths.
async function grantAdmin(
  email: string, // already normalized lowercase
  displayName: string,
  personId: string,
  canViewSensitive: boolean,
  actor: string,
): Promise<Result> {
  const { data: row, error } = await companyOs
    .from("admins")
    .insert({
      email,
      display_name: displayName,
      person_id: personId,
      can_view_sensitive: canViewSensitive,
      created_by: actor,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "admins",
    recordId: row.id,
    operation: "insert",
    actor,
    newData: { email, display_name: displayName, person_id: personId, can_view_sensitive: canViewSensitive },
  });

  const sent = await sendAccessEmail(email);
  refresh();
  if (!sent.ok) {
    // Access is already granted; only the email failed. Surface that precisely.
    return {
      ok: true,
      message: `${email} added, but the email could not be sent (${sent.error}). They can use "Forgot password" on the login page.`,
    };
  }
  return { ok: true, message: `${email} added. ${sent.message}` };
}

// Adds someone who isn't on the team yet: makes sure they exist as a person
// and as an active contractor team member, then grants admin. This is the only
// way a contractor becomes an admin — the employee picker still excludes them.
// An existing person with the same email (e.g. a contact) is reused, and an
// existing team member record is left untouched.
export async function addContractorAdmin(
  rawEmail: string,
  rawName: string,
  canViewSensitive: boolean,
): Promise<Result> {
  const admin = await requireAdmin();

  const email = rawEmail.trim().toLowerCase();
  const name = rawName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!name) return { ok: false, error: "Enter their name." };

  const { data: existingAdmin } = await companyOs
    .from("admins")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingAdmin) return { ok: false, error: `${email} is already an admin.` };

  // people.email is citext + unique, so this match is case-insensitive.
  const { data: found, error: fErr } = await companyOs
    .from("people")
    .select("id, archived_at")
    .eq("email", email)
    .maybeSingle();
  if (fErr) return { ok: false, error: fErr.message };
  if (found?.archived_at) {
    return { ok: false, error: `${email} belongs to an archived person. Restore them first.` };
  }

  let personId = found?.id as string | undefined;
  if (personId) {
    const { error } = await companyOs.from("people").update({ is_team_member: true }).eq("id", personId);
    if (error) return { ok: false, error: error.message };
  } else {
    const newPerson = {
      email,
      full_name: name,
      display_name: name,
      persona: "employee",
      is_team_member: true,
      source: "admin_settings",
    };
    const { data, error } = await companyOs.from("people").insert(newPerson).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not create the person." };
    personId = data.id as string;
    await recordAudit({ table: "people", recordId: personId, operation: "insert", actor: admin.email, newData: newPerson });
  }

  const { data: tm } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    .limit(1)
    .maybeSingle();
  if (!tm) {
    const newMember = {
      person_id: personId,
      employment_type: "contract",
      status: "active",
      start_date: new Date().toISOString().slice(0, 10),
    };
    const { data, error } = await companyOs.from("team_members").insert(newMember).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not create the team member." };
    await recordAudit({ table: "team_members", recordId: data.id, operation: "insert", actor: admin.email, newData: newMember });
  }

  return grantAdmin(email, name, personId, canViewSensitive, admin.email);
}

// Edits the display name and the level (Super Admin => can_view_sensitive).
// Email is no longer editable here: it's the linked employee's login address,
// kept in sync with the people record rather than typed by hand.
export async function updateAdmin(
  id: string,
  fields: { displayName: string; canViewSensitive: boolean },
): Promise<Result> {
  const admin = await requireAdmin();

  const { data: row, error: rErr } = await companyOs
    .from("admins")
    .select("id, email, display_name, can_view_sensitive")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Admin not found." };

  const displayName = fields.displayName.trim() || null;
  const canViewSensitive = fields.canViewSensitive;

  const { error } = await companyOs
    .from("admins")
    .update({ display_name: displayName, can_view_sensitive: canViewSensitive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "admins",
    recordId: id,
    operation: "update",
    actor: admin.email,
    oldData: { display_name: row.display_name, can_view_sensitive: row.can_view_sensitive },
    newData: { display_name: displayName, can_view_sensitive: canViewSensitive },
  });
  refresh();
  return { ok: true, message: "Admin updated." };
}

// Log Time settings: whether this admin logs shifts, and the timezone they're
// shown in. Separate from updateAdmin so the Level/Name edit keeps working
// before docs/db/2026-10-26-time-log.sql adds the columns.
export async function updateAdminTimeTracking(
  id: string,
  fields: { tracksTime: boolean; timeZone: string },
): Promise<Result> {
  const admin = await requireAdmin();

  try {
    new Intl.DateTimeFormat("en", { timeZone: fields.timeZone });
  } catch {
    return { ok: false, error: "Pick a valid timezone." };
  }

  const { data: row, error: rErr } = await companyOs
    .from("admins")
    .select("id, person_id, tracks_time, time_zone")
    .eq("id", id)
    .maybeSingle();
  if (rErr) return { ok: false, error: "Time tracking isn't set up yet — run docs/db/2026-10-26-time-log.sql first." };
  if (!row) return { ok: false, error: "Admin not found." };
  if (fields.tracksTime && !row.person_id) {
    return { ok: false, error: "This admin isn't linked to an employee record, so they can't log time." };
  }
  if (row.tracks_time === fields.tracksTime && row.time_zone === fields.timeZone) return { ok: true };

  const { error } = await companyOs
    .from("admins")
    .update({ tracks_time: fields.tracksTime, time_zone: fields.timeZone })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "admins",
    recordId: id,
    operation: "update",
    actor: admin.email,
    oldData: { tracks_time: row.tracks_time, time_zone: row.time_zone },
    newData: { tracks_time: fields.tracksTime, time_zone: fields.timeZone },
  });
  refresh();
  return { ok: true };
}

export async function resendAccessLink(id: string): Promise<Result> {
  await requireAdmin();
  const { data: row, error } = await companyOs
    .from("admins")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "Admin not found." };
  const sent = await sendAccessEmail(row.email);
  refresh();
  return sent;
}

// Revokes /admin access immediately (the gate checks this table per request).
// The Supabase login itself is kept — it may be re-granted or, later, hold a
// /team identity. Removal is what the audit trail records.
export async function deleteAdmin(id: string): Promise<Result> {
  const admin = await requireAdmin();

  const { data: row, error: rErr } = await companyOs
    .from("admins")
    .select("id, email, display_name")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Admin not found." };
  if (row.email.toLowerCase() === admin.email) {
    return { ok: false, error: "You can't remove yourself — ask another admin." };
  }

  const { error } = await companyOs.from("admins").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "admins",
    recordId: id,
    operation: "delete",
    actor: admin.email,
    oldData: { email: row.email, display_name: row.display_name },
  });
  refresh();
  return { ok: true, message: `${row.email} no longer has admin access.` };
}
