import { listEntity } from "@/lib/admin/query";
import { PageHead } from "@/components/admin/PageHead";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/admin/Badge";
import { ArchivedToggle } from "@/components/admin/ArchivedToggle";
import { FilterBar } from "@/components/admin/FilterBar";
import { DonutChart } from "@/components/admin/charts/DonutChart";
import { getContactsSummary } from "@/lib/admin/contacts-summary";
import { formatDate, formatCents, humanize } from "@/lib/admin/format";
import { firstParam, mergeQuery, type SearchParamsObj } from "@/lib/admin/url";
import Link from "next/link";
import { ContactsShelfProvider, ContactShelfRow, type ContactRow } from "./ContactsShelf";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contacts",
  description: "Every person in the Company Database, one searchable contact spine.",
};

type Person = ContactRow;

const PAGE_SIZE = 25;
const SORTABLE = new Set(["full_name", "email", "phone", "persona", "country", "order_total_aud_cents", "created_at"]);

// Sentinel for "persona is null" — distinct from "" (no filter applied).
const UNSET = "__unset__";

const PERSONA_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "subscriber", label: "Subscriber" },
  { value: "employee", label: "Employee" },
  { value: UNSET, label: "Unset" },
];
// The three sections of the list. Computed by the people_with_deals view:
// customer = has ordered; potential_spam = nameless signup with a bot-pattern
// email or from a 100+/day signup burst; subscriber = everyone else.
const BUCKETS = [
  { value: "customer", label: "Customers" },
  { value: "subscriber", label: "Subscribers" },
  { value: "potential_spam", label: "Potential spam" },
] as const;
const TEAM_OPTIONS = [
  { value: "true", label: "Team only" },
  { value: "false", label: "Non-team" },
];

export default async function ContactsPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  // Alphabetical by default; only an explicit ?dir= flips it.
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "full_name";
  const dirParam = firstParam(searchParams.dir);
  const dir = dirParam === "asc" || dirParam === "desc" ? dirParam : "asc";
  const showArchived = firstParam(searchParams.archived) === "1";

  const personaParam = firstParam(searchParams.persona);
  const bucketParam = firstParam(searchParams.bucket);
  const bucket = BUCKETS.some((b) => b.value === bucketParam) ? bucketParam : "";
  const teamParam = firstParam(searchParams.team);

  const filters: Record<string, string | number | boolean | null> = {};
  if (personaParam) filters.persona = personaParam === UNSET ? null : personaParam;
  if (bucket) filters.contact_bucket = bucket;
  if (teamParam === "true" || teamParam === "false") filters.is_team_member = teamParam === "true";

  const [{ rows, total, pageSize, error }, summary] = await Promise.all([
    listEntity<Person>(
      "people_with_deals",
      "id, full_name, email, phone, persona, country, source, do_not_contact, is_team_member, archived_at, created_at, deal_value_aud_cents, deal_count, order_total_aud_cents, order_count, contact_bucket",
      {
        page,
        pageSize: PAGE_SIZE,
        search: q,
        searchColumns: ["full_name", "email", "phone"],
        sort,
        dir,
        excludeArchived: !showArchived,
        filters,
      },
    ),
    getContactsSummary(),
  ]);

  const columns: Column<Person>[] = [
    {
      key: "full_name",
      header: "Name",
      sortable: true,
      // Shopify has no name for mailing-list signups; show the email, as Shopify does.
      cell: (r) => <span className="admin-cell-strong">{r.full_name || r.email || "(no name)"}</span>,
    },
    { key: "email", header: "Email", sortable: true, cell: (r) => <span className="admin-cell-muted">{r.email}</span> },
    { key: "phone", header: "Phone", sortable: true, cell: (r) => r.phone || <span className="admin-cell-muted">—</span> },
    {
      key: "persona",
      header: "Persona",
      sortable: true,
      cell: (r) => (r.persona ? <Badge>{humanize(r.persona)}</Badge> : <span className="admin-cell-muted">—</span>),
    },
    { key: "country", header: "Country", sortable: true, cell: (r) => r.country || <span className="admin-cell-muted">—</span> },
    {
      key: "order_total_aud_cents",
      header: "Order total",
      sortable: true,
      align: "right",
      className: "admin-cell-mono",
      cell: (r) => (r.order_count ? formatCents(r.order_total_aud_cents) : <span className="admin-cell-muted">—</span>),
    },
    { key: "created_at", header: "Added", sortable: true, cell: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Spine"
        title="Contacts"
        sub={`${total.toLocaleString()} ${total === 1 ? "person" : "people"}${showArchived ? " · showing archived" : ""} in the Company Database`}
        action={
          <ArchivedToggle basePath="/admin/contacts" searchParams={searchParams} showArchived={showArchived} />
        }
      />
      {summary && (
        <div className="admin-summary">
          <div className="admin-summary-pills">
            <Link
              href={"/admin/contacts" + mergeQuery(searchParams, { bucket: null, page: 1 })}
              className={`admin-pill${bucket ? "" : " is-active"}`}
              aria-current={bucket ? undefined : "page"}
            >
              <span className="admin-pill-label">All</span>
              <span className="admin-pill-val">{summary.total.toLocaleString()}</span>
            </Link>
            {BUCKETS.map((b) => {
              const n = b.value === "customer" ? summary.customers : b.value === "subscriber" ? summary.subscribers : summary.potentialSpam;
              return (
                <Link
                  key={b.value}
                  href={"/admin/contacts" + mergeQuery(searchParams, { bucket: b.value, page: 1 })}
                  className={`admin-pill${bucket === b.value ? " is-active" : ""}`}
                  aria-current={bucket === b.value ? "page" : undefined}
                >
                  <span className="admin-pill-label">{b.label}</span>
                  <span className="admin-pill-val">{n.toLocaleString()}</span>
                </Link>
              );
            })}
          </div>
          <div className="admin-summary-grid">
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By persona</div>
              <DonutChart
                data={summary.personas}
                centerLabel="contacts"
                ariaLabel="Contacts by persona"
                neutralLabel="Unset"
                emptyText="No contacts yet."
              />
            </div>
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By source</div>
              <DonutChart
                data={summary.sources}
                centerLabel="contacts"
                ariaLabel="Contacts by source channel"
                emptyText="No source data yet."
              />
            </div>
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">By country</div>
              <DonutChart
                data={summary.countries}
                centerLabel="contacts"
                ariaLabel="Contacts by country"
                neutralLabel="Unknown"
                emptyText="Country data pending enrichment."
              />
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}
      <ContactsShelfProvider>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          dir={dir}
          basePath="/admin/contacts"
          searchParams={searchParams}
          searchPlaceholder="Search name, email, or phone…"
          emptyText="No contacts match."
          filterBar={
            <FilterBar
              basePath="/admin/contacts"
              searchParams={searchParams}
              filters={[
                { key: "persona", label: "Persona", options: PERSONA_OPTIONS },
                { key: "team", label: "Team", options: TEAM_OPTIONS },
              ]}
            />
          }
          renderRow={(row, cells) => <ContactShelfRow row={row}>{cells}</ContactShelfRow>}
        />
      </ContactsShelfProvider>
    </>
  );
}
