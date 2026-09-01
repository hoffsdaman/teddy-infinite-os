import { NextResponse } from "next/server";
import { companyOs } from "@/lib/supabase";
import { readSvixHeaders, verifySvixSignature } from "@/lib/svix";
import {
  ensureSupportBoard,
  createSupportTicket,
  findTicketByNo,
  findOpenTicketByEmail,
  appendEmailReply,
  messageAlreadyProcessed,
} from "@/lib/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Inbound support email -> ticket. Wire a Google/Workspace forwarding rule from
// the support inbox to a Resend inbound address, and point Resend's inbound
// webhook at:
//   https://<this-app>/api/webhooks/support-email/
// The TRAILING SLASH is required (next.config trailingSlash: true; a slashless
// URL answers 308 and Resend does not follow redirects).
//
// Threading:
//   • subject carries a [TD-1042] token         -> comment on that ticket
//   • else an OPEN ticket with the same email   -> comment on that ticket
//   • else                                       -> new ticket (channel "email")
// Idempotent on the provider message id, so a retried webhook never duplicates.

const LOG = "[webhooks/support-email]";

type InboundEmail = {
  type?: string;
  data?: Record<string, unknown>;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Resend inbound shapes the sender a few possible ways; accept them all.
function parseFrom(data: Record<string, unknown>): { email: string | null; name: string | null } {
  const from = data.from;
  if (typeof from === "string") {
    const m = from.match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
    if (m) return { name: m[1]?.trim() || null, email: m[2].trim().toLowerCase() };
    return { name: null, email: from.includes("@") ? from.trim().toLowerCase() : null };
  }
  if (from && typeof from === "object") {
    const o = from as { address?: string; email?: string; name?: string };
    const email = str(o.address) ?? str(o.email);
    return { name: str(o.name), email: email ? email.toLowerCase() : null };
  }
  return { name: null, email: null };
}

function parseMessageId(data: Record<string, unknown>): string | null {
  return (
    str(data.message_id) ??
    str(data.email_id) ??
    str((data.headers as Record<string, unknown> | undefined)?.["message-id"]) ??
    str(data.id)
  );
}

async function personIdForEmail(email: string): Promise<string | null> {
  const { data } = await companyOs
    .from("people")
    .select("id")
    .eq("email", email.toLowerCase())
    .is("archived_at", null)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function POST(request: Request) {
  const secret = process.env.SUPPORT_EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    console.error(`${LOG} SUPPORT_EMAIL_WEBHOOK_SECRET not set — event rejected.`);
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const svixHeaders = readSvixHeaders(request.headers);
  const verdict = verifySvixSignature({ rawBody, headers: svixHeaders, secret });
  if (!verdict.ok) {
    console.error(`${LOG} signature verification failed: ${verdict.reason}`);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: InboundEmail;
  try {
    payload = JSON.parse(rawBody) as InboundEmail;
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const data = payload.data ?? {};
  const { email, name } = parseFrom(data);
  const subject = str(data.subject) ?? "(no subject)";
  const body = str(data.text) ?? str(data.html) ?? "(empty message)";
  // Prefer the stable svix id (constant across retries) for idempotency, then
  // the provider's own message id.
  const messageId = svixHeaders.id || parseMessageId(data);

  if (!email) {
    console.error(`${LOG} inbound email missing sender — dropped.`);
    return NextResponse.json({ received: true, ignored: "no sender" });
  }
  if (!messageId) {
    console.error(`${LOG} inbound email missing message id — dropped.`);
    return NextResponse.json({ received: true, ignored: "no message id" });
  }

  const board = await ensureSupportBoard();

  // Idempotency: a retry of the same message must be a no-op.
  if (await messageAlreadyProcessed(board.id, messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // 1) Explicit [TD-xxxx] token in the subject.
  const token = subject.match(/\bTD-(\d+)\b/i);
  let target = token ? await findTicketByNo(board.id, `TD-${token[1]}`) : null;

  // 2) Otherwise, an open ticket from the same customer.
  if (!target) {
    const open = await findOpenTicketByEmail(board.id, email);
    if (open) target = { id: open.id, personId: null };
  }

  if (target) {
    const authorPersonId = target.personId ?? (await personIdForEmail(email));
    const res = await appendEmailReply({ taskId: target.id, body, messageId, authorEmail: email, authorPersonId });
    if (!res.ok) {
      console.error(`${LOG} append reply failed: ${res.error}`);
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
    return NextResponse.json({ received: true, threaded: target.id });
  }

  // 3) New ticket.
  const created = await createSupportTicket({
    channel: "email",
    customerEmail: email,
    customerName: name,
    subject,
    message: body,
    sourceMessageId: messageId,
  });
  if (!created.ok) {
    console.error(`${LOG} ticket create failed: ${created.error}`);
    return NextResponse.json({ error: created.error }, { status: 500 });
  }
  return NextResponse.json({ received: true, ticketNo: created.ticketNo });
}
