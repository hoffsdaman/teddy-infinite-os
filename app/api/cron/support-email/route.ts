import { NextResponse } from "next/server";
import { gmailClient, gmailConfigured } from "@/lib/gmail";
import { intakeInboundEmail } from "@/lib/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Support-inbox poller. Every few minutes, lists messages in the
 * support@teddybed.com.au inbox that the agent has not yet labelled
 * ("Ingested"), files each one as a support ticket via the shared
 * intakeInboundEmail() path (the same threading + person-linking used by the
 * Resend inbound webhook), then stamps the Ingested label. UNREAD is never
 * touched — humans still see every email as unread.
 *
 * Filing a ticket links the sender to their CRM people row by email; because
 * the daily Shopify sync already populates people.shopify_customer_id and
 * orders.person_id, the matching Shopify order is then one query away in the
 * admin ticket view. No Shopify API call happens here.
 *
 * Idempotency is belt-and-suspenders: the Ingested label keeps a message out of
 * the poll query, and intakeInboundEmail() dedupes on the message id even if a
 * message is seen twice before it is labelled.
 *
 * Plan: docs/plans/customer-support-product.md
 */

const LOG = "[cron/support-email]";
// Cap per run so one invocation stays well inside maxDuration; a backlog drains
// over consecutive runs.
const MAX_PER_RUN = 25;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!gmailConfigured()) {
    // Scheduled but not wired up yet: the operator has not added the
    // GMAIL_* env vars. No-op rather than error, matching the Shopify cron.
    return NextResponse.json({ ok: false, skipped: "Gmail not configured" });
  }

  let client;
  try {
    client = await gmailClient();
  } catch (err) {
    console.error(`${LOG} auth failed:`, err);
    return NextResponse.json({ ok: false, error: "Gmail auth failed" }, { status: 502 });
  }

  const ids = await client.listInboxNeedingIntake(MAX_PER_RUN);

  const summary = { scanned: ids.length, created: 0, threaded: 0, duplicate: 0, non_support: 0, skipped: 0, failed: 0 };

  for (const id of ids) {
    try {
      const msg = await client.getMessage(id);
      if (!msg) {
        // No usable sender — label it so it is not rescanned every run.
        await client.markIngested(id);
        summary.skipped++;
        continue;
      }

      const result = await intakeInboundEmail({
        email: msg.from,
        name: msg.name,
        subject: msg.subject,
        body: msg.body,
        messageId: msg.messageId,
      });

      if (!result.ok) {
        // Leave it UNLABELLED so the next run retries a transient DB failure.
        console.error(`${LOG} intake failed for ${id}: ${result.error}`);
        summary.failed++;
        continue;
      }

      // Filed, threaded, a known duplicate, or classified non-support — in every
      // case the message is handled, so label it so it never re-enters the queue.
      await client.markIngested(id);
      if (result.action === "created") summary.created++;
      else if (result.action === "threaded") summary.threaded++;
      else if (result.action === "skipped_non_support") summary.non_support++;
      else summary.duplicate++;
    } catch (err) {
      // Per-message isolation: one bad message never sinks the whole run.
      console.error(`${LOG} error processing ${id}:`, err);
      summary.failed++;
    }
  }

  return NextResponse.json({ ok: summary.failed === 0, ...summary });
}

// Vercel Cron invokes with GET + Authorization: Bearer $CRON_SECRET.
export async function GET(req: Request) {
  return handle(req);
}

// POST alias for manual triggering.
export async function POST(req: Request) {
  return handle(req);
}
