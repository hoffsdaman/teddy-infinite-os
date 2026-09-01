import { companyOs } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/email";
import { notifyOps } from "@/lib/lark";

// Client billing for portal-origin contractor work requests. The automated
// QuickBooks integration was removed (2026-09; see
// docs/plans/shopify-native-sync.md), so acceptance now always routes to the
// manual path: it computes the billable amount (contractor's 'billable'
// comp rate — default 100% markup on internal hourly), flags the request
// manual_required, and emails the accountant the hours/rate/amount so a human
// raises the invoice in QuickBooks. Never throws and never blocks acceptance.
// Contractor pay (contractor_payments roll-up at the internal rate) is
// untouched by any of this.
// Plan: docs/plans/2026-07-18-client-work-requests.md

export type BillingOutcome =
  | { status: "skipped"; reason: string }
  | { status: "manual_required" | "failed"; reason: string };

const ACCOUNTING_EMAIL = process.env.ACCOUNTING_EMAIL;

type BillableRequest = {
  id: string;
  person_id: string;
  title: string;
  status: string;
  origin: string;
  client_company_id: string | null;
  billing_status: string | null;
  actual_hours: number | string | null;
  actual_overtime_hours: number | string | null;
};

const toNum = (v: number | string | null): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
};

async function addSystemEvent(requestId: string, body: string, meta: Record<string, unknown> = {}) {
  const { error } = await companyOs.from("contractor_work_events").insert({
    request_id: requestId,
    actor_type: "system",
    actor: null,
    type: "message",
    body,
    meta,
  });
  if (error) console.error("[work-billing] event insert failed:", error.message);
}

async function flagManual(
  req: BillableRequest,
  status: "manual_required" | "failed",
  reason: string,
  details: string[],
): Promise<BillingOutcome> {
  await companyOs
    .from("contractor_work_requests")
    .update({ billing_status: status, billing_error: reason, updated_at: new Date().toISOString() })
    .eq("id", req.id);
  await addSystemEvent(req.id, `Client invoicing needs a hand: ${reason}`, { billing_status: status });

  const lines = [
    `Work request "${req.title}" was accepted but could not be invoiced automatically.`,
    `Reason: ${reason}`,
    ...details,
    `Review: https://www.edge8.ai/admin/operations/contractor-requests?open=${req.id}`,
  ];
  if (ACCOUNTING_EMAIL) {
    await sendTransactionalEmail({
      to: ACCOUNTING_EMAIL,
      subject: `Manual invoice needed: ${req.title}`,
      html: lines.map((l) => `<p>${l}</p>`).join("\n"),
      replyTo: "dave@edge8.co",
    });
  }
  await notifyOps(`⚠️ Client invoicing ${status === "failed" ? "failed" : "needs manual handling"}: "${req.title}" — ${reason}`);
  return { status, reason };
}

// Resolve the contractor's current client-billable rate (USD cents) via
// team_members → compensation.
async function billableRateCents(personId: string): Promise<number | null> {
  const { data: tm } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    .maybeSingle();
  if (!tm) return null;
  const { data: comp } = await companyOs
    .from("compensation_sensitive")
    .select("amount_cents")
    .eq("team_member_id", tm.id)
    .eq("comp_type", "billable")
    .eq("is_current", true)
    .maybeSingle();
  const cents = comp?.amount_cents;
  return typeof cents === "number" && cents > 0 ? cents : cents ? Number(cents) : null;
}

export async function runWorkRequestBilling(requestId: string): Promise<BillingOutcome> {
  try {
    return await runBilling(requestId);
  } catch (err) {
    // Belt and braces: acceptance must never fail because billing blew up.
    console.error("[work-billing] unexpected failure:", err);
    return { status: "failed", reason: err instanceof Error ? err.message : "unexpected error" };
  }
}

async function runBilling(requestId: string): Promise<BillingOutcome> {
  const { data } = await companyOs
    .from("contractor_work_requests")
    .select("id, person_id, title, status, origin, client_company_id, billing_status, actual_hours, actual_overtime_hours")
    .eq("id", requestId)
    .maybeSingle();
  const req = data as BillableRequest | null;
  if (!req) return { status: "skipped", reason: "request not found" };

  // Only portal-origin (client) requests are billed; internal admin requests
  // have no client to invoice.
  if (req.origin !== "portal") return { status: "skipped", reason: "admin-origin request" };
  if (req.status !== "completed") return { status: "skipped", reason: "not completed" };
  if (req.billing_status !== null) return { status: "skipped", reason: "already billed" };

  const hours = Math.round((toNum(req.actual_hours) + toNum(req.actual_overtime_hours)) * 100) / 100;
  if (hours <= 0) return flagManual(req, "manual_required", "No billable hours on the request.", []);

  if (!req.client_company_id)
    return flagManual(req, "manual_required", "No client company on the request.", []);

  const rateCents = await billableRateCents(req.person_id);
  if (!rateCents)
    return flagManual(req, "manual_required", "The contractor has no billable rate set (Operations → Contractors).", [
      `Hours delivered: ${hours}`,
    ]);

  const amountCents = Math.round(hours * rateCents);

  const { data: company } = await companyOs
    .from("companies")
    .select("id, name")
    .eq("id", req.client_company_id)
    .maybeSingle();

  // The automated QuickBooks invoice path was removed; every accepted request
  // is flagged for a human to raise the invoice manually, with the full
  // calculation carried to the accountant.
  const amountLabel = `$${(amountCents / 100).toFixed(2)}`;
  return flagManual(
    req,
    "manual_required",
    "Raise this client invoice manually in QuickBooks.",
    [
      `Client: ${company?.name ?? req.client_company_id}`,
      `Hours: ${hours} × $${(rateCents / 100).toFixed(2)}/h = ${amountLabel} (contractor billable rate, 100% markup)`,
    ],
  );
}
