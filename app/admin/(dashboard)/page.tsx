import Link from "next/link";
import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge } from "@/components/admin/Badge";
import { formatCents, timeAgo } from "@/lib/admin/format";
import { MS_DAY, one } from "@/lib/admin/dashboard-helpers";
import { getSupportBoardData, type SupportTicket } from "@/lib/support";
import { AGING_HOURS, isAging, lastActivityAt } from "@/lib/support/aging";

// Live operational data, read fresh on every request.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard",
  description: "Support and orders at a glance: what needs a reply, what needs shipping, and whether the Shopify sync is healthy.",
};

// The daily Shopify cron runs at 16:00 UTC; a run older than this is a problem, not lag.
const SYNC_STALE_MS = 36 * 3600_000;
const QUEUE_SIZE = 5;
// Orders that count: anything Shopify has taken money (or is taking it) for.
const COUNTED_STATUSES = ["paid", "partial_refund", "pending"];
const REVENUE_STATUSES = ["paid", "partial_refund"];

type P = { full_name: string | null; email: string | null };
type OrderRow = {
  id: string;
  order_number: string | null;
  amount_cents: number | null;
  refunded_cents: number | null;
  currency: string | null;
  status: string | null;
  fulfillment_status: string | null;
  created_at: string;
  person_id: string | null;
  people: P | P[] | null;
};
type SyncRow = { entity: string; last_sync: string | null; last_run_at: string | null; last_status: string | null };

function humanDuration(ms: number): string {
  const h = Math.floor(ms / 3600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}
const aud = (cents: number) => formatCents(cents, "aud");

export default async function DashboardPage() {
  const now = Date.now();
  const since30 = new Date(now - 30 * MS_DAY).toISOString();
  const since7 = new Date(now - 7 * MS_DAY).toISOString();

  const [support, orders30Res, unfulfilledRes, syncRes] = await Promise.all([
    getSupportBoardData(30),
    companyOs
      .from("orders")
      .select("id, order_number, amount_cents, refunded_cents, currency, status, fulfillment_status, created_at, person_id")
      .not("shopify_order_id", "is", null)
      .in("status", COUNTED_STATUSES)
      .gte("created_at", since30),
    companyOs
      .from("orders")
      .select("id, order_number, amount_cents, refunded_cents, currency, status, fulfillment_status, created_at, person_id, people(full_name, email)", { count: "exact" })
      .not("shopify_order_id", "is", null)
      .in("status", COUNTED_STATUSES)
      .in("fulfillment_status", ["unfulfilled", "partially_fulfilled"])
      .order("created_at", { ascending: true })
      .limit(QUEUE_SIZE), // exact count for the tile; only the oldest few rows for the queue
    companyOs.from("shopify_sync_state").select("entity, last_sync, last_run_at, last_status"),
  ]);

  // ── Support ─────────────────────────────────────────────────────────────
  const tickets = support.tickets;
  const open = tickets.filter((t) => !t.isResolved);
  const needsReply = open.filter((t) => isAging(t, now)).sort((a, b) => lastActivityAt(a).localeCompare(lastActivityAt(b)));
  const lastEmail = tickets.filter((t) => t.channel === "email").map((t) => t.createdAt).sort().at(-1) ?? null;
  const { metrics } = support;

  // ── Orders ──────────────────────────────────────────────────────────────
  const orders30 = (orders30Res.data ?? []) as OrderRow[];
  const orders7 = orders30.filter((o) => o.created_at >= since7);
  const net = (o: OrderRow) => (o.amount_cents ?? 0) - (o.refunded_cents ?? 0);
  const revenue = (rows: OrderRow[]) => rows.filter((o) => REVENUE_STATUSES.includes(o.status ?? "")).reduce((s, o) => s + net(o), 0);
  const rev30 = revenue(orders30);
  const rev7 = revenue(orders7);
  const paid30 = orders30.filter((o) => REVENUE_STATUSES.includes(o.status ?? ""));
  const aov = paid30.length ? Math.round(rev30 / paid30.length) : 0;
  const refunds30 = orders30.filter((o) => (o.refunded_cents ?? 0) > 0);
  const refunded30 = refunds30.reduce((s, o) => s + (o.refunded_cents ?? 0), 0);
  const unfulfilled = (unfulfilledRes.data ?? []) as OrderRow[];
  const unfulfilledCount = unfulfilledRes.count ?? unfulfilled.length;

  // ── Health ──────────────────────────────────────────────────────────────
  const sync = (syncRes.data ?? []) as SyncRow[];
  const lastRun = sync.map((r) => r.last_run_at).filter(Boolean).sort().at(-1) ?? null;
  const syncStale = !lastRun || now - new Date(lastRun).getTime() > SYNC_STALE_MS;
  const syncErrors = sync.filter((r) => r.last_status?.startsWith("error"));

  return (
    <>
      <PageHead
        title="Dashboard"
        sub="What needs a reply, what needs shipping, and whether the Shopify sync is healthy."
      />

      {/* 1. Support today */}
      <section className="u-mb-6">
        <div className="admin-card-head u-mb-3">
          <h2 className="admin-card-title">Support</h2>
          <Link href="/admin/support" className="admin-btn admin-btn--sm">Open the board →</Link>
        </div>
        <div className="admin-kpi-grid">
          <MetricCard label="Open tickets" value={open.length} sub="on the board" href="/admin/support" />
          <MetricCard
            label="Needs a reply"
            value={needsReply.length}
            sub={`open, no activity for ${AGING_HOURS}h+`}
            href="/admin/support"
          />
          <MetricCard
            label="Median time to resolve"
            value={metrics.medianResolveMs == null ? "—" : humanDuration(metrics.medianResolveMs)}
            sub={`last ${metrics.windowDays} days`}
          />
          <MetricCard label="Resolved" value={metrics.resolvedInWindow} sub={`last ${metrics.windowDays} days`} />
        </div>
      </section>

      {/* 2. Orders (Shopify) */}
      <section className="u-mb-6">
        <div className="admin-card-head u-mb-3">
          <h2 className="admin-card-title">Orders</h2>
          <Link href="/admin/revenue/orders" className="admin-btn admin-btn--sm">All orders →</Link>
        </div>
        <div className="admin-kpi-grid">
          <MetricCard label="Orders, 7 days" value={orders7.length} sub={`${aud(rev7)} net`} href="/admin/revenue/orders" />
          <MetricCard label="Orders, 30 days" value={orders30.length} sub={`${aud(rev30)} net`} href="/admin/revenue/orders" />
          <MetricCard
            label="Unfulfilled"
            value={unfulfilledCount}
            sub={unfulfilledCount ? `oldest ${timeAgo(unfulfilled[0].created_at)}` : "nothing waiting"}
            href="/admin/revenue/orders"
          />
          <MetricCard label="Average order" value={aud(aov)} sub="paid orders, 30 days" />
          <MetricCard
            label="Refunds, 30 days"
            value={refunds30.length}
            sub={refunds30.length ? `${aud(refunded30)} refunded` : "none"}
            href="/admin/revenue/orders?status=refunded"
          />
        </div>
      </section>

      {/* 3. Queues: which, not just how many */}
      <section className="u-grid-2 u-mb-6">
        <div className="admin-card admin-section-card">
          <div className="admin-card-head">
            <h2 className="admin-card-title">Needs a reply</h2>
            <span className="admin-cell-muted">oldest first</span>
          </div>
          {needsReply.length === 0 ? (
            <div className="admin-empty">Every open ticket has been touched in the last {AGING_HOURS}h.</div>
          ) : (
            <div className="admin-list">
              {needsReply.slice(0, QUEUE_SIZE).map((t: SupportTicket) => (
                <Link key={t.id} href="/admin/support" className="admin-list-row u-link-plain">
                  <div className="admin-list-main u-min-0">
                    <div className="admin-list-title u-truncate">{t.subject}</div>
                    <div className="admin-list-sub u-truncate">
                      {t.ticketNo ? `${t.ticketNo} · ` : ""}
                      {t.customerName || t.customerEmail || "Customer"}
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    <Badge tone="warn">quiet {humanDuration(now - new Date(lastActivityAt(t)).getTime())}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="admin-card admin-section-card">
          <div className="admin-card-head">
            <h2 className="admin-card-title">Waiting to ship</h2>
            <span className="admin-cell-muted">oldest first</span>
          </div>
          {unfulfilled.length === 0 ? (
            <div className="admin-empty">Nothing unfulfilled.</div>
          ) : (
            <div className="admin-list">
              {unfulfilled.slice(0, QUEUE_SIZE).map((o) => {
                const who = one(o.people);
                return (
                  <Link
                    key={o.id}
                    href={o.order_number ? `/admin/revenue/orders?q=${encodeURIComponent(o.order_number)}` : "/admin/revenue/orders"}
                    className="admin-list-row u-link-plain"
                  >
                    <div className="admin-list-main u-min-0">
                      <div className="admin-list-title u-truncate">
                        {o.order_number ?? "Order"} · {aud(net(o))}
                      </div>
                      <div className="admin-list-sub u-truncate">{who?.full_name || who?.email || "Customer"}</div>
                    </div>
                    <div className="admin-list-aside">
                      <Badge tone={o.fulfillment_status === "partially_fulfilled" ? "info" : "warn"}>
                        {o.fulfillment_status === "partially_fulfilled" ? "partial" : "unfulfilled"} · {timeAgo(o.created_at)}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 4. Health */}
      <section>
        <div className="admin-card-head u-mb-3">
          <h2 className="admin-card-title">Health</h2>
          <Link href="/admin/settings/agents" className="admin-btn admin-btn--sm">Agents →</Link>
        </div>
        <div className="admin-kpi-grid admin-kpi-grid--2up">
          <MetricCard
            label="Shopify sync"
            value={
              <span className={syncStale || syncErrors.length ? "u-err" : "u-ok"}>
                {syncStale ? "Stale" : syncErrors.length ? "Error" : "Healthy"}
              </span>
            }
            sub={
              lastRun
                ? `last run ${timeAgo(lastRun)}${syncErrors.length ? ` · ${syncErrors[0].last_status}` : ""}`
                : "never run"
            }
            href="/admin/settings/agents"
          />
          <MetricCard
            label="Support inbox"
            value={lastEmail ? timeAgo(lastEmail) : "—"}
            sub={lastEmail ? "last email received" : "no email tickets yet"}
            href="/admin/support"
          />
        </div>
      </section>
    </>
  );
}
