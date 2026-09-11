import { NextResponse } from "next/server";
import { withRoutineRun } from "@/lib/audit/routine-runs";
import { gmailConfigured, syncSupportInbox } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Support inbox → tickets. Every 10 minutes, reads new customer emails from
 * the support Gmail account and files each as a ticket (or a reply on the
 * customer's open ticket) via lib/support.ingestInboundEmail. Idempotent.
 *
 * Query params (manual runs):  ?days=7   backfill that many days
 */
async function handle(req: Request) {
  if (!gmailConfigured()) {
    return NextResponse.json({ ok: false, skipped: "Gmail not configured (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN)" });
  }
  const days = Number(new URL(req.url).searchParams.get("days") ?? "");
  const result = await syncSupportInbox(Number.isFinite(days) && days > 0 ? { days } : {});
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(req: Request) {
  return withRoutineRun("/api/cron/support-gmail/", req, handle);
}
export async function POST(req: Request) {
  return withRoutineRun("/api/cron/support-gmail/", req, handle);
}
