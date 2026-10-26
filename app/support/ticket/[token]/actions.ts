"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/lib/supabase";
import { type Result } from "@/lib/admin/mutations";
import { ensureSupportBoard, intakeColumn } from "@/lib/support";

const REOPEN_REASON_MIN = 5;

// Public: the customer reopens their own resolved ticket from the emailed link.
// The token is the only credential, so everything is looked up from it.
export async function reopenTicketAsCustomer(token: string, reason: string): Promise<Result> {
  const why = reason?.trim() ?? "";
  if (why.length < REOPEN_REASON_MIN) return { ok: false, error: "Tell us a little about what's still wrong." };
  if (!token || token.length < 16) return { ok: false, error: "This link isn't valid." };

  const board = await ensureSupportBoard();
  const { data } = await companyOs
    .from("tasks")
    .select("id, board_column_id, metadata")
    .eq("board_id", board.id)
    .eq("metadata->>customer_token", token)
    .is("archived_at", null)
    .maybeSingle();
  const t = data as { id: string; board_column_id: string | null; metadata: { customer_email?: string } } | null;
  if (!t) return { ok: false, error: "This link isn't valid." };

  const resolved = !!board.columns.find((c) => c.id === t.board_column_id)?.is_done;
  if (!resolved) return { ok: true }; // already open; nothing to do

  const intake = intakeColumn(board);
  const { error } = await companyOs
    .from("tasks")
    .update({ board_column_id: intake.id, status: "open", completed_at: null })
    .eq("id", t.id);
  if (error) return { ok: false, error: "Something went wrong. Please reply to our email instead." };

  await companyOs.from("task_stage_log").insert({
    task_id: t.id,
    from_column_id: t.board_column_id,
    to_column_id: intake.id,
    kind: "move",
    moved_by: null,
    note: `reopened by customer: ${why}`,
  });
  await companyOs.from("task_comments").insert({
    task_id: t.id,
    author_person_id: null,
    author_label: `${t.metadata.customer_email ?? "Customer"} (customer via ticket page)`,
    body: `Reopened the ticket. Reason: ${why}`,
  });
  revalidatePath("/admin/support");
  return { ok: true };
}
