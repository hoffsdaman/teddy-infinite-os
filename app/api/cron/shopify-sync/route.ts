import { NextResponse } from "next/server";
import { shopifyConfigured } from "@/lib/shopify";
import { runShopifySync } from "@/lib/shopify-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Daily Shopify → company_os sync. Pulls customers, products/variants, and
 * orders/lines updated since each entity's high-water mark and upserts them
 * into the native objects. Idempotent — a second run changes nothing.
 *
 * Query params (manual runs):
 *   ?full=1                 backfill: sync from epoch (ignores high-water mark)
 *   ?entities=orders,...    limit to some of customers|products|orders
 *
 * Plan: docs/plans/shopify-native-sync.md
 */

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Entity = "customers" | "products" | "orders";

function parseEntities(url: URL): Entity[] | undefined {
  const raw = url.searchParams.get("entities");
  if (!raw) return undefined;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Entity => s === "customers" || s === "products" || s === "orders");
  return list.length ? list : undefined;
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!shopifyConfigured()) {
    // Pre-cutover no-op: scheduled, but SHOPIFY_SHOP / SHOPIFY_ADMIN_TOKEN are
    // not set yet (create a custom app and add them — see the plan's runbook).
    return NextResponse.json({ ok: false, skipped: "Shopify not configured" });
  }

  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1";
  const entities = parseEntities(url);

  const results = await runShopifySync({ full, entities });
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, full, results }, { status: ok ? 200 : 500 });
}

// Vercel Cron invokes with GET + Authorization: Bearer $CRON_SECRET.
export async function GET(req: Request) {
  return handle(req);
}

// POST alias for manual triggering (e.g. the backfill: POST ?full=1).
export async function POST(req: Request) {
  return handle(req);
}
