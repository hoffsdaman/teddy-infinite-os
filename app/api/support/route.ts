import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupportTicket } from "@/lib/support";
import { notifyOps } from "@/lib/lark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Public support intake for the Teddy storefront form (channel "web_form").
// Mirrors app/api/contact/route.ts: honeypot, silent-success spam handling, and
// a thin body schema. CORS is locked to the storefront origins so only the
// Teddy site can post cross-origin.
//
// next.config sets trailingSlash: true, so the form MUST post to
// https://<this-app>/api/support/  (with the trailing slash) — the slashless
// URL answers 308 and browsers do not resend the POST body on a redirect.

const LOG = "[api/support]";

// Storefront origins allowed to POST cross-origin. Override with
// SUPPORT_ALLOWED_ORIGINS (comma-separated) when the form lives elsewhere.
function allowedOrigins(): string[] {
  const fromEnv = (process.env.SUPPORT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return fromEnv.length
    ? fromEnv
    : ["https://teddybed.com.au", "https://www.teddybed.com.au"];
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigins();
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

// Best-effort in-memory rate limit: at most N posts per IP per window. Serverless
// instances don't share memory, so this trims obvious floods per-instance rather
// than being a hard global cap — the honeypot below is the real spam gate.
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_MAX;
}

const BodySchema = z.object({
  name: z.string().trim().max(200).optional().default(""),
  email: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(300),
  message: z.string().trim().max(10_000).optional().default(""),
  orderNumber: z.string().trim().max(64).optional().default(""),
  // Honeypot: real users never fill this. Any value = bot.
  website: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400, headers: cors });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a valid email and subject." }, { status: 400, headers: cors });
  }
  const { name, email, subject, message, orderNumber, website } = parsed.data;

  // Honeypot: feign success, create nothing (mirrors the contact form).
  if (website) {
    console.warn(`${LOG} honeypot tripped for ${email}`);
    return NextResponse.json({ ok: true }, { headers: cors });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429, headers: cors });
  }

  const res = await createSupportTicket({
    channel: "web_form",
    customerEmail: email,
    customerName: name || null,
    subject,
    message: message || null,
    orderNumber: orderNumber || null,
  });
  if (!res.ok) {
    console.error(`${LOG} ticket create failed: ${res.error}`);
    return NextResponse.json({ error: "Could not submit your request. Please try again." }, { status: 500, headers: cors });
  }

  void notifyOps(`🎫 New support ticket ${res.ticketNo}\n${name || "—"} <${email}>\n${subject}`);

  return NextResponse.json({ ok: true, ticketNo: res.ticketNo }, { headers: cors });
}
