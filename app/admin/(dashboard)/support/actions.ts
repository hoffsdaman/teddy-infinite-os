"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin/audit";
import { type Result } from "@/lib/admin/mutations";
import { createSupportTicket, ensureSupportBoard } from "@/lib/support";
import { sendTransactionalEmail } from "@/lib/email";

// Both full and support-role admins work tickets, so these gate on requireAdmin
// (the support-only role is a containment concern handled in middleware, not an
// extra permission). Every action re-derives the Support board so a caller can
// never move a card onto a column that isn't on it.

function refresh() {
  revalidatePath("/admin/support");
}

export async function createManualTicket(input: {
  customerEmail: string;
  customerName?: string;
  subject: string;
  message?: string;
  orderNumber?: string;
}): Promise<Result & { ticketNo?: string }> {
  const admin = await requireAdmin();
  const res = await createSupportTicket({
    channel: "manual",
    customerEmail: input.customerEmail,
    customerName: input.customerName || null,
    subject: input.subject,
    message: input.message || null,
    orderNumber: input.orderNumber || null,
    createdByLabel: admin.email,
  });
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({ table: "tasks", recordId: res.taskId, operation: "insert", actor: admin.email, newData: { support: true, ticketNo: res.ticketNo } });
  refresh();
  return { ok: true, ticketNo: res.ticketNo };
}

export async function moveTicket(taskId: string, toColumnId: string): Promise<Result> {
  const admin = await requireAdmin();
  const board = await ensureSupportBoard();
  const column = board.columns.find((c) => c.id === toColumnId);
  if (!column) return { ok: false, error: "That column is not on the Support board." };

  const { data: task } = await companyOs
    .from("tasks")
    .select("id, board_id, board_column_id")
    .eq("id", taskId)
    .maybeSingle();
  const t = task as { id: string; board_id: string; board_column_id: string | null } | null;
  if (!t || t.board_id !== board.id) return { ok: false, error: "Ticket not found on the Support board." };
  if (t.board_column_id === toColumnId) return { ok: true };

  // Resolution timestamp is the whole point of the metric: stamp completed_at
  // when the card lands on a done column, clear it when it moves back out.
  const updates = {
    board_column_id: toColumnId,
    status: column.is_done ? "done" : "open",
    completed_at: column.is_done ? new Date().toISOString() : null,
  };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  // Audit history is free: log the column move.
  await companyOs.from("task_stage_log").insert({
    task_id: taskId,
    from_column_id: t.board_column_id,
    to_column_id: toColumnId,
    kind: "move",
    moved_by: null,
    note: null,
  });
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}

export async function commentOnTicket(taskId: string, body: string): Promise<Result> {
  const admin = await requireAdmin();
  const board = await ensureSupportBoard();
  const text = body?.trim();
  if (!text) return { ok: false, error: "Write a reply first." };

  const { data: task } = await companyOs.from("tasks").select("id, board_id").eq("id", taskId).maybeSingle();
  const t = task as { id: string; board_id: string } | null;
  if (!t || t.board_id !== board.id) return { ok: false, error: "Ticket not found on the Support board." };

  const { error } = await companyOs
    .from("task_comments")
    .insert({ task_id: taskId, author_person_id: null, author_label: admin.email, body: text });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// PR5 — outbound reply. Sends the agent's reply to the customer via Resend from
// the support address, with the [TD-####] token in the subject so the customer's
// response threads back onto this same ticket (PR4). Logs the reply as a comment
// so the thread shows both sides, and nudges the ticket to "Waiting on Customer".
// This SENDS mail; it never reads or searches a mailbox.
export async function replyToCustomer(taskId: string, body: string): Promise<Result> {
  const admin = await requireAdmin();
  const board = await ensureSupportBoard();
  const text = body?.trim();
  if (!text) return { ok: false, error: "Write a reply first." };

  const { data: task } = await companyOs
    .from("tasks")
    .select("id, board_id, title, board_column_id, metadata")
    .eq("id", taskId)
    .maybeSingle();
  const t = task as {
    id: string;
    board_id: string;
    title: string;
    board_column_id: string | null;
    metadata: { customer_email?: string; ticket_no?: string } | null;
  } | null;
  if (!t || t.board_id !== board.id) return { ok: false, error: "Ticket not found on the Support board." };

  const email = t.metadata?.customer_email;
  if (!email) return { ok: false, error: "This ticket has no customer email to reply to." };
  const ticketNo = t.metadata?.ticket_no ?? "";
  const subject = ticketNo ? `[${ticketNo}] Re: ${t.title}` : `Re: ${t.title}`;
  const from = process.env.SUPPORT_EMAIL_FROM || process.env.RESEND_FROM || undefined;

  const sent = await sendTransactionalEmail({
    to: email,
    subject,
    html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${escapeHtml(text)}</div>`,
    from,
    replyTo: from,
    logMeta: { source: "support_reply", ticket_no: ticketNo },
  });
  if (!sent) return { ok: false, error: "Email could not be sent (check RESEND_API_KEY / RESEND_FROM)." };

  // Record the outbound reply in the thread.
  await companyOs
    .from("task_comments")
    .insert({ task_id: taskId, author_person_id: null, author_label: `${admin.email} → customer`, body: text });

  // Ball is in the customer's court now.
  const waiting = board.columns.find((c) => /waiting/i.test(c.name));
  if (waiting && t.board_column_id !== waiting.id) {
    await companyOs
      .from("tasks")
      .update({ board_column_id: waiting.id, status: "open", completed_at: null })
      .eq("id", taskId);
    await companyOs.from("task_stage_log").insert({
      task_id: taskId,
      from_column_id: t.board_column_id,
      to_column_id: waiting.id,
      kind: "move",
      moved_by: null,
      note: "replied to customer",
    });
  }

  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: admin.email, newData: { support_reply: ticketNo } });
  refresh();
  return { ok: true };
}
