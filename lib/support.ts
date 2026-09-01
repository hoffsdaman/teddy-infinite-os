// Customer Support — the whole product is: tickets are tasks. There is no
// support_tickets table. Every channel (manual, web form, email) files a row
// into company_os.tasks on ONE board (slug "support"), through the single
// helper createSupportTicket() below, so the metadata convention lives in
// exactly one file. See docs/plans/customer-support-product.md.
//
// Server-only. All access is via the service-role companyOs client (company_os
// has RLS on with no policies), so callers gate themselves.

import { companyOs } from "@/lib/supabase";
import { getOrCreatePerson } from "@/lib/company-os";

// The Support board's identity + column names. New → In Progress → Waiting on
// Customer → Resolved (Resolved is the only is_done column). Renaming a column
// in the DB later does not break intake — we resolve the intake column as "the
// first non-done column by position", never by name.
export const SUPPORT_BOARD_SLUG = "support";
export const SUPPORT_BOARD_NAME = "Support";
export const SUPPORT_COLUMNS: Array<{ name: string; is_done: boolean }> = [
  { name: "New", is_done: false },
  { name: "In Progress", is_done: false },
  { name: "Waiting on Customer", is_done: false },
  { name: "Resolved", is_done: true },
];

export type SupportChannel = "manual" | "web_form" | "email";

// The shape every channel writes into tasks.metadata. ticket_no threads email
// replies (PR4) and gives humans a handle; customer_email is the CRM join key.
export type SupportMeta = {
  channel: SupportChannel;
  customer_email: string;
  customer_name: string | null;
  ticket_no: string;
  // Shopify/store order the ticket is about, if the customer gave one.
  order_number?: string | null;
  // Idempotency key for email intake — the Resend/provider message id, so a
  // retried webhook does not create a duplicate ticket.
  source_message_id?: string;
};

export type SupportColumn = { id: string; name: string; position: number; is_done: boolean };
export type SupportBoard = { id: string; slug: string; name: string; columns: SupportColumn[] };

// Idempotently ensure the Support board and its four columns exist, and return
// them. Self-seeding means the product works the moment this code deploys — no
// manual migration required — and is safe to call on every request (one board
// read, columns only inserted when missing). The durable SQL seed also lives in
// docs/db/2026-09-01-customer-support.sql for operators who prefer to pre-seed.
export async function ensureSupportBoard(): Promise<SupportBoard> {
  const existing = await companyOs
    .from("boards")
    .select("id, slug, name")
    .eq("slug", SUPPORT_BOARD_SLUG)
    .maybeSingle();

  let board = existing.data as { id: string; slug: string; name: string } | null;

  if (!board) {
    // Place it after any existing boards.
    const { data: last } = await companyOs
      .from("boards")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort_order = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 1;
    const { data: created, error } = await companyOs
      .from("boards")
      .insert({ name: SUPPORT_BOARD_NAME, slug: SUPPORT_BOARD_SLUG, sort_order })
      .select("id, slug, name")
      .single();
    if (error) {
      // Lost a race (unique slug): read the winner rather than failing.
      const retry = await companyOs
        .from("boards")
        .select("id, slug, name")
        .eq("slug", SUPPORT_BOARD_SLUG)
        .maybeSingle();
      if (!retry.data) throw new Error(`ensureSupportBoard: ${error.message}`);
      board = retry.data as { id: string; slug: string; name: string };
    } else {
      board = created as { id: string; slug: string; name: string };
    }
  }

  const cols = await companyOs
    .from("board_columns")
    .select("id, name, position, is_done")
    .eq("board_id", board.id)
    .order("position");
  let columns = (cols.data ?? []) as SupportColumn[];

  if (columns.length === 0) {
    await companyOs
      .from("board_columns")
      .insert(SUPPORT_COLUMNS.map((c, i) => ({ board_id: board!.id, name: c.name, position: i, is_done: c.is_done })));
    const reread = await companyOs
      .from("board_columns")
      .select("id, name, position, is_done")
      .eq("board_id", board.id)
      .order("position");
    columns = (reread.data ?? []) as SupportColumn[];
  }

  return { id: board.id, slug: board.slug, name: board.name, columns };
}

// The column a new ticket lands in: the first non-done column by position
// ("New" today, but resilient to renames/reorders).
export function intakeColumn(board: SupportBoard): SupportColumn {
  return board.columns.find((c) => !c.is_done) ?? board.columns[0];
}

// Next human ticket number: "TD-1042". The plan's durable design is a Postgres
// sequence (docs/db/…sql); we prefer it when present and fall back to a
// max-scan so numbering works before the migration is applied. Support volume
// makes the tiny race window on the fallback path a non-issue, and PR4 threads
// replies by open ticket + email when a number ever collides.
export async function nextTicketNo(boardId: string): Promise<string> {
  // Preferred path: the SECURITY DEFINER RPC over the sequence, if it exists.
  const rpc = await companyOs.rpc("next_support_ticket_no");
  if (!rpc.error && typeof rpc.data === "string" && rpc.data) return rpc.data;

  // Fallback: highest existing TD-NNNN on the board, plus one (min 1001).
  const { data } = await companyOs
    .from("tasks")
    .select("metadata")
    .eq("board_id", boardId)
    .not("metadata->>ticket_no", "is", null);
  let max = 1000;
  for (const row of (data ?? []) as { metadata: { ticket_no?: string } }[]) {
    const n = Number.parseInt(String(row.metadata?.ticket_no ?? "").replace(/^TD-/, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `TD-${max + 1}`;
}

export type CreateTicketInput = {
  channel: SupportChannel;
  customerEmail: string;
  customerName?: string | null;
  subject: string;
  message?: string | null;
  orderNumber?: string | null;
  sourceMessageId?: string | null;
  createdByLabel?: string | null; // audit label for manual intake
};

export type CreateTicketResult =
  | { ok: true; taskId: string; ticketNo: string; personId: string | null }
  | { ok: false; error: string };

// The single intake path. Ensures the board, mints a ticket number, links the
// customer to their people row (so their full history is one click away), and
// files the card into the New column with the metadata convention.
export async function createSupportTicket(input: CreateTicketInput): Promise<CreateTicketResult> {
  const email = input.customerEmail?.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "A valid customer email is required." };
  const subject = input.subject?.trim();
  if (!subject) return { ok: false, error: "Give the ticket a subject." };

  const board = await ensureSupportBoard();
  const column = intakeColumn(board);

  // Link to the CRM person (get-or-create by email). A failure here must not
  // lose the ticket — we file it unlinked and log, matching the contact form.
  let personId: string | null = null;
  const person = await getOrCreatePerson({ email, name: input.customerName ?? null, source: `support_${input.channel}` });
  if (person.ok) personId = person.id;
  else console.error("[support] person link failed:", person.error);

  const ticketNo = await nextTicketNo(board.id);

  const metadata: SupportMeta = {
    channel: input.channel,
    customer_email: email,
    customer_name: input.customerName?.trim() || null,
    ticket_no: ticketNo,
    ...(input.orderNumber?.trim() ? { order_number: input.orderNumber.trim() } : {}),
    ...(input.sourceMessageId ? { source_message_id: input.sourceMessageId } : {}),
  };

  // Position at the end of the intake column.
  const { data: tail } = await companyOs
    .from("tasks")
    .select("position")
    .eq("board_id", board.id)
    .eq("board_column_id", column.id)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((tail as { position: number } | null)?.position ?? 0) + 1;

  const row = {
    board_id: board.id,
    board_column_id: column.id,
    title: subject,
    description: input.message?.trim() || null,
    priority: "p3",
    status: "open",
    position,
    subject_type: personId ? "person" : null,
    subject_id: personId,
    metadata,
  };

  const { data, error } = await companyOs.from("tasks").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  return { ok: true, taskId: (data as { id: string }).id, ticketNo, personId };
}

// A support ticket as the admin view needs it: the underlying task plus the
// customer link, the comment thread, and the two timestamps the metric reads.
export type SupportComment = { id: string; author: string; body: string; createdAt: string };
export type SupportTicket = {
  id: string;
  ticketNo: string | null;
  subject: string;
  description: string | null;
  columnId: string | null;
  channel: SupportChannel | null;
  customerEmail: string | null;
  customerName: string | null;
  orderNumber: string | null;
  personId: string | null;
  isResolved: boolean;
  createdAt: string;
  completedAt: string | null; // set when the card lands on Resolved
  comments: SupportComment[];
};

export type SupportBoardData = {
  board: SupportBoard;
  tickets: SupportTicket[];
  metrics: SupportMetrics;
};

// Passive, derived reporting — never an SLA. Arrival = created_at, resolution =
// completed_at, so time-to-resolve = completed_at − created_at. Median (not
// mean) over a trailing window so one stale ticket does not skew it.
export type SupportMetrics = {
  openCount: number;
  resolvedInWindow: number;
  medianResolveMs: number | null;
  windowDays: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// Load the whole Support board for /admin/support: tickets (newest first),
// their comments, and the resolve-time metrics. One board read + a handful of
// batched follow-ups, mirroring lib/boards/data.ts.
export async function getSupportBoardData(windowDays = 30): Promise<SupportBoardData> {
  const board = await ensureSupportBoard();
  const doneColumnIds = new Set(board.columns.filter((c) => c.is_done).map((c) => c.id));

  const { data: taskRows } = await companyOs
    .from("tasks")
    .select("id, title, description, board_column_id, subject_type, subject_id, status, completed_at, created_at, metadata")
    .eq("board_id", board.id)
    .is("parent_task_id", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const tasks = (taskRows ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    board_column_id: string | null;
    subject_type: string | null;
    subject_id: string | null;
    status: string;
    completed_at: string | null;
    created_at: string;
    metadata: Partial<SupportMeta> | null;
  }>;

  const taskIds = tasks.map((t) => t.id);
  const personIds = [...new Set(tasks.map((t) => t.subject_id).filter(Boolean))] as string[];

  const [commentsRes, peopleRes] = await Promise.all([
    taskIds.length
      ? companyOs
          .from("task_comments")
          .select("id, task_id, author_label, body, created_at")
          .in("task_id", taskIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; task_id: string; author_label: string; body: string; created_at: string }[] }),
    personIds.length
      ? companyOs.from("people").select("id, full_name, display_name, email").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; display_name: string | null; email: string }[] }),
  ]);

  const commentsByTask = new Map<string, SupportComment[]>();
  for (const c of (commentsRes.data ?? []) as { id: string; task_id: string; author_label: string; body: string; created_at: string }[]) {
    const list = commentsByTask.get(c.task_id) ?? [];
    list.push({ id: c.id, author: c.author_label, body: c.body, createdAt: c.created_at });
    commentsByTask.set(c.task_id, list);
  }
  const personById = new Map(
    ((peopleRes.data ?? []) as { id: string; full_name: string | null; display_name: string | null; email: string }[]).map((p) => [
      p.id,
      p,
    ]),
  );

  const tickets: SupportTicket[] = tasks.map((t) => {
    const person = t.subject_id ? personById.get(t.subject_id) : undefined;
    return {
      id: t.id,
      ticketNo: t.metadata?.ticket_no ?? null,
      subject: t.title,
      description: t.description,
      columnId: t.board_column_id,
      channel: (t.metadata?.channel as SupportChannel) ?? null,
      customerEmail: t.metadata?.customer_email ?? person?.email ?? null,
      customerName: t.metadata?.customer_name ?? person?.full_name ?? person?.display_name ?? null,
      orderNumber: t.metadata?.order_number ?? null,
      personId: t.subject_type === "person" ? t.subject_id : null,
      isResolved: t.board_column_id ? doneColumnIds.has(t.board_column_id) : t.status === "done",
      createdAt: t.created_at,
      completedAt: t.completed_at,
      comments: commentsByTask.get(t.id) ?? [],
    };
  });

  const windowStart = Date.now() - windowDays * 86_400_000;
  const resolveDurations: number[] = [];
  for (const t of tickets) {
    if (t.isResolved && t.completedAt) {
      const done = new Date(t.completedAt).getTime();
      if (Number.isFinite(done) && done >= windowStart) {
        const ms = done - new Date(t.createdAt).getTime();
        if (Number.isFinite(ms) && ms >= 0) resolveDurations.push(ms);
      }
    }
  }

  const metrics: SupportMetrics = {
    openCount: tickets.filter((t) => !t.isResolved).length,
    resolvedInWindow: resolveDurations.length,
    medianResolveMs: median(resolveDurations),
    windowDays,
  };

  return { board, tickets, metrics };
}

// Find the open ticket for a customer email (used by email intake to thread a
// reply onto an existing ticket instead of opening a new one). "Open" = not in
// a done column. Newest first.
export async function findOpenTicketByEmail(boardId: string, email: string): Promise<{ id: string } | null> {
  const norm = email.trim().toLowerCase();
  const { data } = await companyOs
    .from("tasks")
    .select("id, status, board_column_id")
    .eq("board_id", boardId)
    .is("archived_at", null)
    .eq("metadata->>customer_email", norm)
    .order("created_at", { ascending: false });
  const board = await ensureSupportBoard();
  const doneColumnIds = new Set(board.columns.filter((c) => c.is_done).map((c) => c.id));
  for (const t of (data ?? []) as { id: string; status: string; board_column_id: string | null }[]) {
    const resolved = t.board_column_id ? doneColumnIds.has(t.board_column_id) : t.status === "done";
    if (!resolved) return { id: t.id };
  }
  return null;
}

// True if any task on the board already recorded this provider message id
// (email idempotency) — either as the ticket's originating message, or in the
// list of reply message ids appended to a ticket. task_comments has no metadata
// column, so processed reply ids live on the parent task's metadata instead.
export async function messageAlreadyProcessed(boardId: string, messageId: string): Promise<boolean> {
  const [origin, replies] = await Promise.all([
    companyOs.from("tasks").select("id").eq("board_id", boardId).eq("metadata->>source_message_id", messageId).limit(1).maybeSingle(),
    companyOs.from("tasks").select("id").eq("board_id", boardId).contains("metadata", { email_message_ids: [messageId] }).limit(1).maybeSingle(),
  ]);
  return Boolean(origin.data) || Boolean(replies.data);
}

// Find a ticket by its human number ("TD-1042"), scoped to the board.
export async function findTicketByNo(boardId: string, ticketNo: string): Promise<{ id: string; personId: string | null } | null> {
  const { data } = await companyOs
    .from("tasks")
    .select("id, subject_type, subject_id")
    .eq("board_id", boardId)
    .eq("metadata->>ticket_no", ticketNo)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  const t = data as { id: string; subject_type: string | null; subject_id: string | null } | null;
  if (!t) return null;
  return { id: t.id, personId: t.subject_type === "person" ? t.subject_id : null };
}

// Append a customer's emailed reply to an existing ticket as a comment, record
// the message id on the parent task for idempotency, and reopen the ticket if it
// had been resolved (a reply means it wasn't done). Best-effort reopen — a
// failure there never loses the reply.
export async function appendEmailReply(input: {
  taskId: string;
  body: string;
  messageId: string;
  authorEmail: string;
  authorPersonId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: taskData } = await companyOs
    .from("tasks")
    .select("id, board_id, board_column_id, metadata")
    .eq("id", input.taskId)
    .maybeSingle();
  const task = taskData as { id: string; board_id: string; board_column_id: string | null; metadata: Record<string, unknown> } | null;
  if (!task) return { ok: false, error: "Ticket not found." };

  const { error: commentErr } = await companyOs.from("task_comments").insert({
    task_id: input.taskId,
    author_person_id: input.authorPersonId,
    author_label: `${input.authorEmail} (customer via email)`,
    body: input.body,
  });
  if (commentErr) return { ok: false, error: commentErr.message };

  // Record the message id for idempotency (dedupe on webhook retries).
  const existingIds = Array.isArray((task.metadata as { email_message_ids?: unknown }).email_message_ids)
    ? ((task.metadata as { email_message_ids: string[] }).email_message_ids)
    : [];
  const nextMeta = { ...task.metadata, email_message_ids: [...new Set([...existingIds, input.messageId])] };

  // Reopen to the intake column if currently resolved.
  const board = await ensureSupportBoard();
  const doneColumnIds = new Set(board.columns.filter((c) => c.is_done).map((c) => c.id));
  const wasResolved = task.board_column_id ? doneColumnIds.has(task.board_column_id) : false;
  const intake = intakeColumn(board);

  const updates: Record<string, unknown> = { metadata: nextMeta };
  if (wasResolved) {
    updates.board_column_id = intake.id;
    updates.status = "open";
    updates.completed_at = null;
  }
  const { error: updateErr } = await companyOs.from("tasks").update(updates).eq("id", input.taskId);
  if (updateErr) console.error("[support] reply metadata update failed:", updateErr.message);
  if (wasResolved) {
    await companyOs.from("task_stage_log").insert({
      task_id: input.taskId,
      from_column_id: task.board_column_id,
      to_column_id: intake.id,
      kind: "move",
      moved_by: null,
      note: "reopened by customer email reply",
    });
  }
  return { ok: true };
}
