import { companyOs } from "@/lib/supabase";
import { humanize } from "@/lib/admin/format";

// Whole-database aggregates for the Contacts insight cards. One narrow select,
// paged past PostgREST's 1,000-row cap, aggregated in JS. Mirrors
// lib/admin/company-summary.ts.

const PAGE = 1000;

// Persona order for a stable donut; "Unset" (null persona) renders muted last.
const PERSONA_ORDER = ["customer", "subscriber", "prospect", "client", "job_seeker", "employee"] as const;

// Messy free-text source collapsed into a handful of channels.
function sourceBucket(raw: string | null): string {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "Other";
  if (s === "shopify") return "Shopify";
  if (s === "support_email") return "Support email";
  if (s === "manual") return "Added by hand";
  if (s.includes("import") || s === "thoughtflow_crm") return "Import";
  if (s === "linkedin" || s === "itviec") return "LinkedIn / job boards";
  if (s === "referral") return "Referral";
  if (
    s === "inbound" ||
    s === "aio-pad" ||
    s.includes("edge8.ai") ||
    s.includes("ai-officer") ||
    s.includes("infiniteleverage")
  )
    return "Inbound (web)";
  return "Other";
}

export type ContactsSummary = {
  total: number;
  customers: number;
  subscribers: number;
  personas: Array<{ label: string; value: number }>;
  sources: Array<{ label: string; value: number }>;
  countries: Array<{ label: string; value: number }>;
};

export async function getContactsSummary(): Promise<ContactsSummary | null> {
  const rows: Array<{ persona: string | null; source: string | null; country: string | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const res = await companyOs
      .from("people")
      .select("persona, source, country")
      .is("archived_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (res.error || !res.data) return null;
    rows.push(...(res.data as typeof rows));
    if (res.data.length < PAGE) break;
  }

  const personaCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  for (const r of rows) {
    const persona = r.persona?.trim() || "__unset__";
    personaCounts.set(persona, (personaCounts.get(persona) ?? 0) + 1);
    const bucket = sourceBucket(r.source);
    sourceCounts.set(bucket, (sourceCounts.get(bucket) ?? 0) + 1);
    const country = r.country?.trim() || "Unknown";
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
  }

  // Personas in fixed order, then "Unset" (neutral, pinned last by the donut).
  const personas = [
    ...PERSONA_ORDER.map((p) => ({ label: humanize(p), value: personaCounts.get(p) ?? 0 })),
    { label: "Unset", value: personaCounts.get("__unset__") ?? 0 },
  ].filter((d) => d.value > 0);

  const sources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  // Countries by count desc; "Unknown" pinned last (the donut mutes + tails it).
  const countries = [...countryCounts.entries()]
    .filter(([label]) => label !== "Unknown")
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
  const unknown = countryCounts.get("Unknown") ?? 0;
  if (unknown > 0) countries.push({ label: "Unknown", value: unknown });

  return {
    total: rows.length,
    customers: personaCounts.get("customer") ?? 0,
    subscribers: personaCounts.get("subscriber") ?? 0,
    personas,
    sources,
    countries,
  };
}
