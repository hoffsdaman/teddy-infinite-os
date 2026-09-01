import { companyOs } from "@/lib/supabase";
import { shopifyGraphQL, paginate } from "@/lib/shopify";

// Shopify → native company_os sync. Customers become people, products become
// products (+ product_variants), orders become orders (+ order_lines). One
// engine drives both the daily cron and the backfill — a backfill is just this
// run with { full: true } (since = epoch). Idempotent: upserts keyed on the
// Shopify GID, so re-running changes nothing.
//
// Plan: docs/plans/shopify-native-sync.md

const EPOCH = "2000-01-01T00:00:00Z";
const PAGE = 250;
const CHUNK = 500; // rows per upsert batch

type Entity = "customers" | "products" | "orders";

export type EntityResult = {
  entity: Entity;
  fetched: number;
  written: number;
  since: string;
  highWater: string | null;
  ok: boolean;
  error?: string;
};

const toCents = (amount: string | null | undefined): number =>
  Math.round(parseFloat(amount ?? "0") * 100) || 0;

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

function mapConsent(state: string | null | undefined): "subscribed" | "unsubscribed" | "never_asked" {
  if (state === "SUBSCRIBED") return "subscribed";
  if (state === "UNSUBSCRIBED") return "unsubscribed";
  return "never_asked"; // NOT_SUBSCRIBED / PENDING / null
}

// Shopify financial status → orders.status (within orders_status_check).
function mapFinancialStatus(s: string | null | undefined): string {
  switch (s) {
    case "PAID":
      return "paid";
    case "REFUNDED":
      return "refunded";
    case "PARTIALLY_REFUNDED":
      return "partial_refund";
    case "VOIDED":
      return "failed";
    case "EXPIRED":
      return "expired";
    default:
      return "pending"; // PENDING / AUTHORIZED / PARTIALLY_PAID / null
  }
}

async function getSince(entity: Entity, full: boolean): Promise<string> {
  if (full) return EPOCH;
  const { data } = await companyOs
    .from("shopify_sync_state")
    .select("last_sync")
    .eq("entity", entity)
    .maybeSingle();
  return (data?.last_sync as string | undefined) ?? EPOCH;
}

async function writeState(entity: Entity, highWater: string | null, ok: boolean, error?: string) {
  await companyOs.from("shopify_sync_state").upsert(
    {
      entity,
      // Only advance the high-water mark on success, and never move it backward.
      ...(ok && highWater ? { last_sync: highWater } : {}),
      last_run_at: new Date().toISOString(),
      last_status: ok ? "ok" : `error: ${error ?? "unknown"}`.slice(0, 200),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entity" },
  );
}

// ── customers → people ─────────────────────────────────────────────────────
type CustomerNode = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  updatedAt: string;
  emailMarketingConsent: { marketingState: string | null; consentUpdatedAt: string | null } | null;
  defaultAddress: { city: string | null; provinceCode: string | null; countryCodeV2: string | null; phone: string | null } | null;
};

function personRow(c: CustomerNode) {
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
  return {
    shopify_customer_id: c.id,
    email: c.email,
    first_name: c.firstName,
    last_name: c.lastName,
    full_name: fullName,
    display_name: fullName,
    phone: c.phone ?? c.defaultAddress?.phone ?? null,
    city: c.defaultAddress?.city ?? null,
    state_province: c.defaultAddress?.provinceCode ?? null,
    country: c.defaultAddress?.countryCodeV2 ?? null,
    marketing_consent: mapConsent(c.emailMarketingConsent?.marketingState),
    marketing_consent_at: c.emailMarketingConsent?.consentUpdatedAt ?? null,
    marketing_consent_source: "shopify",
    source: "shopify",
    persona: "customer",
    updated_at: new Date().toISOString(),
  };
}

async function syncCustomers(full: boolean): Promise<EntityResult> {
  const since = await getSince("customers", full);
  const nodes: CustomerNode[] = [];
  let highWater: string | null = null;
  try {
    for await (const node of paginate<CustomerNode>(
      (after) => ({
        query: `query($after: String) {
          customers(first: ${PAGE}, after: $after, sortKey: UPDATED_AT, query: "updated_at:>'${since}'") {
            edges { node { id email firstName lastName phone updatedAt
              emailMarketingConsent { marketingState consentUpdatedAt }
              defaultAddress { city provinceCode countryCodeV2 phone } } }
            pageInfo { hasNextPage endCursor } } }`,
        variables: { after },
      }),
      (data) => (data as { customers: { edges: { node: CustomerNode }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).customers,
    )) {
      if (!node.email) continue; // people.email is NOT NULL; skip email-less customers
      nodes.push(node);
      if (!highWater || node.updatedAt > highWater) highWater = node.updatedAt;
    }

    let written = 0;
    for (const batch of chunk(nodes, CHUNK)) {
      const { error, count } = await companyOs
        .from("people")
        .upsert(batch.map(personRow), { onConflict: "shopify_customer_id", count: "exact" });
      if (error) throw new Error(error.message);
      written += count ?? batch.length;
    }
    await writeState("customers", highWater, true);
    return { entity: "customers", fetched: nodes.length, written, since, highWater, ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown";
    await writeState("customers", highWater, false, error);
    return { entity: "customers", fetched: nodes.length, written: 0, since, highWater, ok: false, error };
  }
}

// ── products → products + product_variants ─────────────────────────────────
type VariantNode = { id: string; sku: string | null; title: string | null; price: string | null; inventoryQuantity: number | null };
type ProductNode = {
  id: string;
  title: string;
  handle: string;
  productType: string | null;
  status: string;
  updatedAt: string;
  variants: { edges: { node: VariantNode }[]; pageInfo: { hasNextPage: boolean } };
};

async function syncProducts(full: boolean): Promise<EntityResult> {
  const since = await getSince("products", full);
  const products: ProductNode[] = [];
  let highWater: string | null = null;
  try {
    for await (const node of paginate<ProductNode>(
      (after) => ({
        query: `query($after: String) {
          products(first: ${PAGE}, after: $after, sortKey: UPDATED_AT, query: "updated_at:>'${since}'") {
            edges { node { id title handle productType status updatedAt
              variants(first: 100) { edges { node { id sku title price inventoryQuantity } } pageInfo { hasNextPage } } } }
            pageInfo { hasNextPage endCursor } } }`,
        variables: { after },
      }),
      (data) => (data as { products: { edges: { node: ProductNode }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).products,
    )) {
      products.push(node);
      if (!highWater || node.updatedAt > highWater) highWater = node.updatedAt;
      if (node.variants.pageInfo.hasNextPage) {
        console.warn(`[shopify-sync] product ${node.id} has >100 variants; extra variants skipped.`);
      }
    }

    let written = 0;
    for (const p of products) {
      const variants = p.variants.edges.map((e) => e.node);
      const minCents = variants.length
        ? Math.min(...variants.map((v) => toCents(v.price)).filter((c) => c > 0), toCents(variants[0].price))
        : 0;
      const { data: prow, error: perr } = await companyOs
        .from("products")
        .upsert(
          {
            shopify_product_id: p.id,
            type: "physical",
            slug: p.handle,
            title: p.title,
            active: p.status === "ACTIVE",
            amount_cents: Number.isFinite(minCents) ? minCents : 0,
            currency: "aud",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "shopify_product_id" },
        )
        .select("id")
        .maybeSingle();
      if (perr) throw new Error(`product ${p.id}: ${perr.message}`);
      const productId = prow?.id as string | undefined;
      if (!productId) throw new Error(`product ${p.id}: no id returned`);

      if (variants.length) {
        const { error: verr } = await companyOs.from("product_variants").upsert(
          variants.map((v) => ({
            product_id: productId,
            shopify_variant_id: v.id,
            sku: v.sku,
            title: v.title,
            amount_cents: toCents(v.price),
            currency: "aud",
            inventory_quantity: v.inventoryQuantity ?? null,
            active: p.status === "ACTIVE",
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "shopify_variant_id" },
        );
        if (verr) throw new Error(`variants for ${p.id}: ${verr.message}`);
      }
      written++;
    }
    await writeState("products", highWater, true);
    return { entity: "products", fetched: products.length, written, since, highWater, ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown";
    await writeState("products", highWater, false, error);
    return { entity: "products", fetched: products.length, written: 0, since, highWater, ok: false, error };
  }
}

// ── orders → orders + order_lines ──────────────────────────────────────────
type MoneySet = { shopMoney: { amount: string; currencyCode?: string } } | null;
type LineNode = {
  id: string;
  title: string;
  quantity: number;
  sku: string | null;
  variant: { id: string } | null;
  product: { id: string } | null;
  originalUnitPriceSet: MoneySet;
  discountedTotalSet: MoneySet;
};
type OrderNode = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currentTotalPriceSet: MoneySet;
  totalTaxSet: MoneySet;
  totalShippingPriceSet: MoneySet;
  totalRefundedSet: MoneySet;
  customer: { id: string; email: string | null } | null;
  lineItems: { edges: { node: LineNode }[]; pageInfo: { hasNextPage: boolean } };
};

// gid → id lookup maps loaded once per run.
async function loadGidMap(table: "products" | "product_variants", gidCol: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const PAGE_DB = 1000;
  for (let from = 0; ; from += PAGE_DB) {
    const { data, error } = await companyOs
      .from(table)
      .select(`id, ${gidCol}`)
      .not(gidCol, "is", null)
      .range(from, from + PAGE_DB - 1);
    if (error) throw new Error(`load ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Record<string, string>>;
    for (const r of rows) map.set(r[gidCol], r.id);
    if (rows.length < PAGE_DB) break;
  }
  return map;
}

async function syncOrders(full: boolean): Promise<EntityResult> {
  const since = await getSince("orders", full);
  const orders: OrderNode[] = [];
  let highWater: string | null = null;
  try {
    // Preload product/variant/person lookup maps (products+customers already synced).
    const productByGid = await loadGidMap("products", "shopify_product_id");
    const variantByGid = await loadGidMap("product_variants", "shopify_variant_id");
    const personByGid = new Map<string, string>();
    {
      const PAGE_DB = 1000;
      for (let from = 0; ; from += PAGE_DB) {
        const { data, error } = await companyOs
          .from("people")
          .select("id, shopify_customer_id")
          .not("shopify_customer_id", "is", null)
          .range(from, from + PAGE_DB - 1);
        if (error) throw new Error(`load people: ${error.message}`);
        const rows = (data ?? []) as Array<{ id: string; shopify_customer_id: string }>;
        for (const r of rows) personByGid.set(r.shopify_customer_id, r.id);
        if (rows.length < PAGE_DB) break;
      }
    }

    for await (const node of paginate<OrderNode>(
      (after) => ({
        query: `query($after: String) {
          orders(first: ${PAGE}, after: $after, sortKey: UPDATED_AT, query: "updated_at:>'${since}'") {
            edges { node { id name createdAt updatedAt displayFinancialStatus displayFulfillmentStatus
              currentTotalPriceSet { shopMoney { amount currencyCode } }
              totalTaxSet { shopMoney { amount } }
              totalShippingPriceSet { shopMoney { amount } }
              totalRefundedSet { shopMoney { amount } }
              customer { id email }
              lineItems(first: 100) { edges { node { id title quantity sku
                variant { id } product { id }
                originalUnitPriceSet { shopMoney { amount } }
                discountedTotalSet { shopMoney { amount } } } } pageInfo { hasNextPage } } } }
            pageInfo { hasNextPage endCursor } } }`,
        variables: { after },
      }),
      (data) => (data as { orders: { edges: { node: OrderNode }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).orders,
    )) {
      orders.push(node);
      if (!highWater || node.updatedAt > highWater) highWater = node.updatedAt;
      if (node.lineItems.pageInfo.hasNextPage) {
        console.warn(`[shopify-sync] order ${node.name} has >100 line items; extra lines skipped.`);
      }
    }

    // Resolve person_id for every order; create a minimal person for any
    // customer not already synced (orders.person_id is NOT NULL).
    for (const o of orders) {
      const gid = o.customer?.id;
      if (gid && !personByGid.has(gid) && o.customer?.email) {
        const { data: prow, error } = await companyOs
          .from("people")
          .upsert(
            {
              shopify_customer_id: gid,
              email: o.customer.email,
              source: "shopify",
              persona: "customer",
              marketing_consent_source: "shopify",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "shopify_customer_id" },
          )
          .select("id")
          .maybeSingle();
        if (error) throw new Error(`order ${o.name} customer: ${error.message}`);
        if (prow?.id) personByGid.set(gid, prow.id as string);
      }
    }

    // Upsert orders in batches.
    let written = 0;
    const orderRows = orders
      .map((o) => {
        const personId = o.customer?.id ? personByGid.get(o.customer.id) : undefined;
        if (!personId) {
          console.warn(`[shopify-sync] order ${o.name} has no resolvable customer; skipped.`);
          return null;
        }
        return {
          person_id: personId,
          payment_method: "shopify",
          shopify_order_id: o.id,
          order_number: o.name,
          amount_cents: toCents(o.currentTotalPriceSet?.shopMoney.amount),
          tax_cents: toCents(o.totalTaxSet?.shopMoney.amount),
          shipping_cents: toCents(o.totalShippingPriceSet?.shopMoney.amount),
          refunded_cents: toCents(o.totalRefundedSet?.shopMoney.amount),
          currency: (o.currentTotalPriceSet?.shopMoney.currencyCode ?? "AUD").toLowerCase(),
          status: mapFinancialStatus(o.displayFinancialStatus),
          fulfillment_status: (o.displayFulfillmentStatus ?? "").toLowerCase() || null,
          created_at: o.createdAt,
          updated_at: new Date().toISOString(),
          metadata: {
            shopify: {
              updated_at: o.updatedAt,
              financial_status: o.displayFinancialStatus,
              fulfillment_status: o.displayFulfillmentStatus,
            },
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    for (const batch of chunk(orderRows, CHUNK)) {
      const { error } = await companyOs.from("orders").upsert(batch, { onConflict: "shopify_order_id" });
      if (error) throw new Error(error.message);
      written += batch.length;
    }

    // Map order gid → id, then replace each order's lines (delete + insert) so
    // removed lines don't linger. Bounded per order.
    const orderIdByGid = await loadOrderIds(orders.map((o) => o.id));
    for (const o of orders) {
      const orderId = orderIdByGid.get(o.id);
      if (!orderId) continue;
      const lines = o.lineItems.edges.map((e) => e.node);
      await companyOs.from("order_lines").delete().eq("order_id", orderId);
      if (lines.length) {
        const { error } = await companyOs.from("order_lines").insert(
          lines.map((l) => ({
            order_id: orderId,
            product_id: l.product?.id ? productByGid.get(l.product.id) ?? null : null,
            variant_id: l.variant?.id ? variantByGid.get(l.variant.id) ?? null : null,
            shopify_line_id: l.id,
            title: l.title,
            sku: l.sku,
            quantity: l.quantity,
            unit_amount_cents: toCents(l.originalUnitPriceSet?.shopMoney.amount),
            total_amount_cents: toCents(l.discountedTotalSet?.shopMoney.amount),
          })),
        );
        if (error) throw new Error(`lines for ${o.name}: ${error.message}`);
      }
    }

    await writeState("orders", highWater, true);
    return { entity: "orders", fetched: orders.length, written, since, highWater, ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown";
    await writeState("orders", highWater, false, error);
    return { entity: "orders", fetched: orders.length, written: 0, since, highWater, ok: false, error };
  }
}

async function loadOrderIds(gids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const batch of chunk(gids, 500)) {
    const { data, error } = await companyOs
      .from("orders")
      .select("id, shopify_order_id")
      .in("shopify_order_id", batch);
    if (error) throw new Error(`load order ids: ${error.message}`);
    for (const r of (data ?? []) as Array<{ id: string; shopify_order_id: string }>) {
      map.set(r.shopify_order_id, r.id);
    }
  }
  return map;
}

// Run the sync. Order matters: customers → products → orders (orders resolve
// FKs against the first two). `full: true` is the backfill (since = epoch).
export async function runShopifySync(
  opts: { full?: boolean; entities?: Entity[] } = {},
): Promise<EntityResult[]> {
  const full = opts.full ?? false;
  const which = opts.entities ?? (["customers", "products", "orders"] as Entity[]);
  const results: EntityResult[] = [];
  if (which.includes("customers")) results.push(await syncCustomers(full));
  if (which.includes("products")) results.push(await syncProducts(full));
  if (which.includes("orders")) results.push(await syncOrders(full));
  return results;
}
