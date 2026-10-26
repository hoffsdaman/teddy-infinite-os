// Server-only Gmail client for the support-inbox poller. NEVER import from a
// client component.
//
// Auth is OAuth2 with a long-lived refresh token minted once by the mailbox
// owner (support@teddybed.com.au). We exchange it for a short-lived access
// token on each run — no token is ever persisted by the app.
//
// The poller is read-plus-label only: it lists messages, reads them, and adds
// an "Ingested" label so the same message is never filed twice. It NEVER
// touches the UNREAD label — humans still see every email as unread in the
// mailbox; the label is purely the agent's bookmark.
//
// Env:
//   GMAIL_CLIENT_ID       OAuth2 client id (Google Cloud console)
//   GMAIL_CLIENT_SECRET   OAuth2 client secret
//   GMAIL_REFRESH_TOKEN   refresh token for support@teddybed.com.au
//
// Scope required when minting the token: https://mail.google.com/ (or the
// narrower gmail.modify — we only read + add labels).
//
// Plan: docs/plans/customer-support-product.md

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// The label the agent stamps on messages it has filed. Messages carrying it are
// excluded from the poll query, so it is the durable dedup key alongside the
// per-message idempotency check in lib/support.ts.
export const INGESTED_LABEL = "Ingested";

export function gmailConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN,
  );
}

export type InboundMessage = {
  id: string;
  // A stable RFC822 Message-Id when present (best for cross-transport
  // idempotency), else the Gmail message id.
  messageId: string;
  from: string; // email address, lowercased
  name: string | null;
  subject: string;
  body: string; // plain text (HTML stripped as a fallback)
};

// Exchange the refresh token for a short-lived access token. Thrown errors let
// the cron run fail loudly rather than silently skipping the inbox.
async function accessToken(): Promise<string> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID ?? "",
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? "",
      refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Gmail token refresh failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`);
  }
  return json.access_token;
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`Gmail API ${path} failed (${res.status}): ${(json as { error?: { message?: string } }).error?.message ?? "unknown"}`);
  }
  return json;
}

// A Gmail client bound to one access token for the duration of a poll run.
export type GmailClient = {
  listInboxNeedingIntake: (max: number) => Promise<string[]>;
  getMessage: (id: string) => Promise<InboundMessage | null>;
  markIngested: (id: string) => Promise<void>;
};

export async function gmailClient(): Promise<GmailClient> {
  const token = await accessToken();
  const labelId = await ensureIngestedLabel(token);

  return {
    // Everything in the inbox the agent has not yet labelled. Read state is
    // deliberately not part of the query — humans reading mail must not hide it
    // from intake, and the label alone decides what is still pending.
    async listInboxNeedingIntake(max: number): Promise<string[]> {
      const q = encodeURIComponent(`in:inbox -label:${INGESTED_LABEL}`);
      const json = await api<{ messages?: Array<{ id: string }> }>(
        token,
        `/messages?q=${q}&maxResults=${Math.max(1, Math.min(max, 100))}`,
      );
      return (json.messages ?? []).map((m) => m.id);
    },

    async getMessage(id: string): Promise<InboundMessage | null> {
      const msg = await api<GmailMessage>(token, `/messages/${id}?format=full`);
      return parseMessage(msg);
    },

    async markIngested(id: string): Promise<void> {
      await api(token, `/messages/${id}/modify`, {
        method: "POST",
        body: JSON.stringify({ addLabelIds: [labelId] }),
        // Note: no removeLabelIds — UNREAD is never touched.
      });
    },
  };
}

// Find the "Ingested" label id, creating the label on first run so the operator
// does not have to make it by hand.
async function ensureIngestedLabel(token: string): Promise<string> {
  const list = await api<{ labels?: Array<{ id: string; name: string }> }>(token, "/labels");
  const found = (list.labels ?? []).find((l) => l.name === INGESTED_LABEL);
  if (found) return found.id;
  const created = await api<{ id: string }>(token, "/labels", {
    method: "POST",
    body: JSON.stringify({ name: INGESTED_LABEL, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return created.id;
}

// ── MIME parsing ─────────────────────────────────────────────────────────────

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  payload?: GmailPart;
};

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const h = (headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value?.trim() || null;
}

// "Jane Roe <jane@x.com>" | "jane@x.com" → { name, email }
function parseFromHeader(raw: string | null): { email: string | null; name: string | null } {
  if (!raw) return { email: null, name: null };
  const m = raw.match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (m) return { name: m[1]?.trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: raw.includes("@") ? raw.trim().toLowerCase() : null };
}

function decodeBase64Url(data: string): string {
  // Gmail returns base64url; Buffer handles it directly.
  return Buffer.from(data, "base64url").toString("utf8");
}

// Prefer text/plain; fall back to the first text/html with tags stripped. Walks
// the (possibly nested) multipart tree and ignores attachments.
function extractBody(part: GmailPart | undefined): string {
  if (!part) return "";
  const plain = findPart(part, "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);
  const html = findPart(part, "text/html");
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  // Single-part message with an inline body.
  if (part.body?.data && (part.mimeType ?? "").startsWith("text/")) {
    const raw = decodeBase64Url(part.body.data);
    return part.mimeType === "text/html" ? stripHtml(raw) : raw;
  }
  return "";
}

function findPart(part: GmailPart, mimeType: string): GmailPart | null {
  if (part.mimeType === mimeType && !part.filename && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = findPart(child, mimeType);
    if (hit) return hit;
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseMessage(msg: GmailMessage): InboundMessage | null {
  const headers = msg.payload?.headers;
  const { email, name } = parseFromHeader(header(headers, "From"));
  if (!email) return null;
  const subject = header(headers, "Subject") ?? "(no subject)";
  const rfcId = header(headers, "Message-Id");
  const body = extractBody(msg.payload).trim() || "(empty message)";
  return {
    id: msg.id,
    messageId: rfcId ?? `gmail:${msg.id}`,
    from: email,
    name,
    subject,
    body,
  };
}
