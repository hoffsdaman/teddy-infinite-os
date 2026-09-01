// One-time (or repeatable) Shopify backfill into native company_os objects.
// Runs the same engine as the daily cron with { full: true } (since = epoch),
// so it is idempotent — safe to re-run, and safe to re-run after a crash.
//
//   npx tsx scripts/shopify/backfill.ts                     # all entities
//   npx tsx scripts/shopify/backfill.ts --entities orders   # one/some
//
// Requires in .env.local (loaded manually below, like the other scripts):
//   SUPABASE_URL, SUPABASE_SECRET_KEY   (write to company_os)
//   SHOPIFY_SHOP, SHOPIFY_ADMIN_TOKEN   (read from Shopify)
//
// Apply docs/db/2026-09-01-shopify-native-sync.sql FIRST — the tables and the
// new CHECK values must exist. Plan: docs/plans/shopify-native-sync.md

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  let file: string;
  try {
    file = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    console.error("No .env.local found in the current directory.");
    process.exit(1);
  }
  for (const line of file.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1").trim();
  }
}

type Entity = "customers" | "products" | "orders";

function parseEntities(): Entity[] | undefined {
  const i = process.argv.indexOf("--entities");
  if (i === -1) return undefined;
  const raw = process.argv[i + 1] ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Entity => s === "customers" || s === "products" || s === "orders");
  return list.length ? list : undefined;
}

async function main() {
  loadEnvLocal();

  for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SHOPIFY_SHOP", "SHOPIFY_ADMIN_TOKEN"]) {
    if (!process.env[k]) {
      console.error(`Missing ${k} in .env.local.`);
      process.exit(1);
    }
  }

  // Import after env is set so lib/supabase picks up the credentials.
  const { runShopifySync } = await import("../../lib/shopify-sync");

  const entities = parseEntities();
  console.log(`Shopify backfill starting${entities ? ` (${entities.join(", ")})` : " (all entities)"}…`);
  const started = Date.now();
  const results = await runShopifySync({ full: true, entities });

  console.log("\nResults:");
  for (const r of results) {
    console.log(
      `  ${r.entity.padEnd(10)} ${r.ok ? "ok " : "ERR"}  fetched=${r.fetched} written=${r.written}` +
        (r.highWater ? ` highWater=${r.highWater}` : "") +
        (r.error ? `  error=${r.error}` : ""),
    );
  }
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
