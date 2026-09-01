// Server-only Shopify Admin API client. NEVER import from a client component.
//
// Auth is a single non-expiring Admin API access token from a custom app
// (Shopify admin → Settings → Apps → Develop apps). No OAuth, no refresh — the
// token lives in an env var. Reads only: read_products, read_orders,
// read_customers.
//
// Env:
//   SHOPIFY_SHOP         the *.myshopify.com domain (e.g. teddybed.myshopify.com)
//   SHOPIFY_ADMIN_TOKEN  the custom app's Admin API access token
//
// Plan: docs/plans/shopify-native-sync.md

const API_VERSION = "2025-01";

export function shopifyConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_SHOP && process.env.SHOPIFY_ADMIN_TOKEN);
}

function endpoint(): string {
  const shop = process.env.SHOPIFY_SHOP ?? "";
  return `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
  extensions?: {
    cost?: {
      throttleStatus?: { currentlyAvailable: number; restoreRate: number; maximumAvailable: number };
    };
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One GraphQL call with bounded retry on throttling / transient 5xx. Throws on
// hard errors — callers (the sync engine) let the run fail so the high-water
// mark is not advanced past unprocessed data.
export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  if (!shopifyConfigured()) {
    throw new Error("Shopify is not configured (SHOPIFY_SHOP / SHOPIFY_ADMIN_TOKEN).");
  }

  let attempt = 0;
  // 6 attempts with backoff covers Shopify's leaky-bucket throttling and brief
  // 5xx blips without masking a real outage.
  for (;;) {
    attempt++;
    let res: Response;
    try {
      res = await fetch(endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN ?? "",
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (attempt >= 6) throw err;
      await sleep(500 * attempt);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 6) {
        throw new Error(`Shopify ${res.status} after ${attempt} attempts.`);
      }
      const retryAfter = Number(res.headers.get("Retry-After")) || attempt;
      await sleep(retryAfter * 1000);
      continue;
    }

    const json = (await res.json().catch(() => ({}))) as GraphQLResponse<T>;

    // GraphQL-level throttling arrives as a 200 with a THROTTLED error.
    const throttled = json.errors?.some((e) => /throttl/i.test(e.message));
    if (throttled && attempt < 6) {
      const avail = json.extensions?.cost?.throttleStatus?.currentlyAvailable ?? 0;
      const restore = json.extensions?.cost?.throttleStatus?.restoreRate ?? 50;
      await sleep(Math.max(1000, ((1000 - avail) / Math.max(restore, 1)) * 1000));
      continue;
    }

    if (json.errors?.length) {
      throw new Error(`Shopify GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    if (!json.data) throw new Error("Shopify GraphQL returned no data.");
    return json.data;
  }
}

// Cursor-paginate one connection. `build(cursor)` returns the query for the
// next page; `pluck` extracts the connection node ({ edges, pageInfo }) from
// the response. Yields each edge's node.
export async function* paginate<TNode>(
  build: (cursor: string | null) => { query: string; variables?: Record<string, unknown> },
  pluck: (data: unknown) => {
    edges: Array<{ node: TNode }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  },
): AsyncGenerator<TNode> {
  let cursor: string | null = null;
  for (;;) {
    const { query, variables } = build(cursor);
    const data = await shopifyGraphQL<unknown>(query, variables ?? {});
    const conn = pluck(data);
    for (const edge of conn.edges) yield edge.node;
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) return;
    cursor = conn.pageInfo.endCursor;
  }
}
