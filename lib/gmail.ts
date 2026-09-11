// Server-only. Polls the support Gmail inbox and files each new customer email
// as a ticket through the same path as the inbound webhook (ingestInboundEmail
// in lib/support.ts). Read-only against Gmail: nothing is labelled, moved or
// marked as read.
//
// Env (an OAuth client for the support mailbox; the refresh token never expires
// unless revoked):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
//
// High-water mark: the newest internalDate seen, stored in
// company_os.shopify_sync_state under entity "gmail_support" (the table is a
// generic per-entity sync marker despite its name). Every message is also
// deduped on its Gmail id, so overlapping windows never double-file.

import { companyOs } from "@/lib/supabase";
import { ingestInboundEmail } from "@/lib/support";

const ENTITY = "gmail_support";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const PAGE = 100;
const MAX_PER_RUN = 300;

// Senders that are never a customer: bounces, platform notifications, app and
// payment-provider mail, and the support address itself.
const IGNORED_SENDERS =
  /(^|[<\s])(mailer-daemon|postmaster|no-?reply|noreply|notifications?|donotreply|marketing[.-]?[a-z]*|hello|service|sales|customerservice)@|@(shopify\.com|shopifyemail\.com|google\.com|googlemail\.com|formsubmitapp\.com|klaviyo\.com|paypal\.com(\.au)?|partners\.zip\.co|cloudhq\.net|hulkapps\.com)\b/i;

// Whole domains that are the business itself or its partners, not customers.
// The company's own staff and the warehouse / 3PL write to this inbox all day
// about orders, but those threads are operations, not customer tickets.
// Extend with SUPPORT_IGNORED_SENDERS="domain.com,other.com,someone@x.com".
const DEFAULT_IGNORED_DOMAINS = ["teddybed.com.au", "jasonl.com.au"];
function ignoredSenderList(): string[] {
  const extra = (process.env.SUPPORT_IGNORED_SENDERS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...DEFAULT_IGNORED_DOMAINS, ...extra];
}
function isIgnoredSender(email: string, raw: string): boolean {
  const e = email.toLowerCase();
  const domain = e.split("@")[1] ?? "";
  if (IGNORED_SENDERS.test(raw) || IGNORED_SENDERS.test(e)) return true;
  return ignoredSenderList().some((x) => (x.includes("@") ? e === x : domain === x || domain.endsWith(`.${x}`)));
}

// Auto-responders never start or continue a conversation.
const AUTO_SUBJECT = /^(automatic reply|auto(matic)?[- ]?reply|out of office|auto-?response)/i;

export function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID ?? "",
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? "",
      refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Gmail token refresh failed: ${data.error ?? res.status} ${data.error_description ?? ""}`.trim());
  return data.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gmail meters "units per minute per user"; a backfill of a few hundred
// messages can trip it. Back off and retry on 403/429, fail on anything else.
async function gmailGet<T>(token: string, path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return (await res.json()) as T;
    const text = (await res.text()).slice(0, 200);
    const throttled = res.status === 429 || (res.status === 403 && /quota|rate/i.test(text));
    if (throttled && attempt < 6) {
      await sleep(Math.min(30_000, 2_000 * 2 ** (attempt - 1)));
      continue;
    }
    throw new Error(`Gmail ${path.split("?")[0]} -> ${res.status}: ${text}`);
  }
}

type Header = { name: string; value: string };
type Part = { mimeType?: string; body?: { data?: string; size?: number }; parts?: Part[] };
type Message = {
  id: string;
  threadId: string;
  internalDate: string;
  payload?: Part & { headers?: Header[] };
};

function header(msg: Message, name: string): string | null {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value?.trim() || null;
}

function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

// First text/plain part, else html stripped to text.
function bodyText(part: Part | undefined): string {
  if (!part) return "";
  const collect = (p: Part, mime: string): string | null => {
    if (p.mimeType === mime && p.body?.data) return decodeBody(p.body.data);
    for (const c of p.parts ?? []) {
      const found = collect(c, mime);
      if (found) return found;
    }
    return null;
  };
  const plain = collect(part, "text/plain");
  if (plain) return plain;
  const html = collect(part, "text/html");
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "\'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Cut the quoted history off a reply so the ticket shows what the customer
// actually wrote this time.
function stripQuoted(text: string): string {
  const markers = [/^On .{5,200} wrote:\s*$/m, /^-{2,}\s*Original Message\s*-{2,}$/mi, /^From: .+$/m, /^>+ ?/m];
  let cut = text.length;
  for (const m of markers) {
    const i = text.search(m);
    if (i > 0 && i < cut) cut = i;
  }
  const out = text.slice(0, cut).trim();
  return out || text.trim();
}

function parseFrom(raw: string | null): { email: string | null; name: string | null } {
  if (!raw) return { email: null, name: null };
  const m = raw.match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (m) return { name: m[1]?.trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: raw.includes("@") ? raw.trim().toLowerCase() : null };
}

async function readState(): Promise<Date | null> {
  const { data } = await companyOs.from("shopify_sync_state").select("last_sync").eq("entity", ENTITY).maybeSingle();
  const v = (data as { last_sync: string | null } | null)?.last_sync;
  return v ? new Date(v) : null;
}

async function writeState(highWater: Date | null, ok: boolean, error?: string) {
  await companyOs.from("shopify_sync_state").upsert(
    {
      entity: ENTITY,
      ...(ok && highWater ? { last_sync: highWater.toISOString() } : {}),
      last_run_at: new Date().toISOString(),
      last_status: ok ? "ok" : `error: ${error ?? "unknown"}`.slice(0, 200),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entity" },
  );
}

export type GmailSyncResult = {
  ok: boolean;
  since: string;
  fetched: number;
  created: number;
  threaded: number;
  duplicates: number;
  ignored: number;
  highWater: string | null;
  error?: string;
  // dryRun only: what would have been filed.
  preview?: Array<{ at: string; from: string; subject: string }>;
};

// Pull inbound mail newer than the high-water mark (or `days` back when given
// or when no mark exists yet) and file each one as a ticket or a reply.
export async function syncSupportInbox(opts: { days?: number; dryRun?: boolean } = {}): Promise<GmailSyncResult> {
  const now = new Date();
  const fallback = new Date(now.getTime() - (opts.days ?? 1) * 86_400_000);
  const since = opts.days ? fallback : ((await readState()) ?? fallback);
  const result: GmailSyncResult = { ok: false, since: since.toISOString(), fetched: 0, created: 0, threaded: 0, duplicates: 0, ignored: 0, highWater: null };
  let highWater: Date | null = null;
  if (opts.dryRun) result.preview = [];
  try {
    const token = await accessToken();
    const me = await gmailGet<{ emailAddress: string }>(token, "/profile");
    const self = me.emailAddress.toLowerCase();
    // Gmail's `after:` is second-granular; overlap by a minute and rely on the
    // per-message dedupe.
    const after = Math.floor(since.getTime() / 1000) - 60;
    const q = encodeURIComponent(`after:${after} -from:me -in:spam -in:trash -in:drafts`);
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(
        token,
        `/messages?q=${q}&maxResults=${PAGE}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < MAX_PER_RUN);
    result.fetched = ids.length;

    // Oldest first so ticket numbers follow arrival order.
    const msgs: Message[] = [];
    for (const id of ids) {
      msgs.push(await gmailGet<Message>(token, `/messages/${id}?format=full`));
      await sleep(120); // stay well under the per-minute unit quota
    }
    msgs.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));

    for (const msg of msgs) {
      const at = new Date(Number(msg.internalDate));
      if (!highWater || at > highWater) highWater = at;
      const from = parseFrom(header(msg, "From"));
      const fromRaw = header(msg, "From") ?? "";
      const subject = header(msg, "Subject") ?? "(no subject)";
      if (!from.email || from.email === self || isIgnoredSender(from.email, fromRaw) || AUTO_SUBJECT.test(subject)) {
        result.ignored++;
        continue;
      }
      const body = stripQuoted(bodyText(msg.payload));
      if (opts.dryRun) {
        result.preview!.push({ at: at.toISOString(), from: fromRaw, subject });
        continue;
      }
      const res = await ingestInboundEmail({ email: from.email, name: from.name, subject, body, messageId: `gmail:${msg.id}` });
      if (!res.ok) throw new Error(`${subject}: ${res.error}`);
      if (res.outcome === "created") result.created++;
      else if (res.outcome === "threaded") result.threaded++;
      else result.duplicates++;
    }
    result.ok = true;
    result.highWater = (highWater ?? since).toISOString();
    if (!opts.dryRun) await writeState(highWater ?? since, true);
  } catch (err) {
    result.error = err instanceof Error ? err.message : "unknown";
    if (!opts.dryRun) await writeState(highWater, false, result.error);
  }
  return result;
}
