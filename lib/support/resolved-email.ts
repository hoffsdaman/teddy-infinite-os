import { randomBytes } from "node:crypto";
import { companyOs } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/email";
import { PALETTE as P } from "@/lib/design/palette";

// "Your ticket is resolved" email + the customer's ticket link.
//
// The link carries a random token stored on the ticket (metadata.customer_token)
// rather than the ticket id, so it can't be guessed and can be revoked by
// clearing the field. Sending is best-effort: a failed send never blocks the move
// that triggered it. One email per ticket per RESEND_GAP_MS, so a resolve →
// reopen → resolve slip doesn't email the customer twice.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://teddy-infinite-os.vercel.app").replace(/\/$/, "");
const RESEND_GAP_MS = 24 * 3600_000;

type TicketRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  completed_at: string | null;
  board_column_id: string | null;
  metadata: Record<string, unknown> & {
    customer_email?: string;
    customer_name?: string | null;
    ticket_no?: string;
    customer_token?: string;
    resolved_email_sent_at?: string;
  };
};

export function ticketUrl(token: string): string {
  return `${SITE_URL}/support/ticket/${token}/`;
}

// Staff replies to the customer and the customer's own messages; never internal notes.
export function isCustomerVisibleComment(authorLabel: string): boolean {
  return authorLabel.includes("→ customer") || authorLabel.includes("(customer");
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function humanSpan(ms: number): string {
  const h = Math.max(1, Math.round(ms / 3600_000));
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });
}

export function renderResolvedEmail(opts: {
  firstName: string | null;
  ticketNo: string;
  subject: string;
  openedAt: string;
  resolvedAt: string;
  link: string;
}): string {
  const hi = opts.firstName ? `Hi ${esc(opts.firstName)},` : "Hi there,";
  const took = humanSpan(new Date(opts.resolvedAt).getTime() - new Date(opts.openedAt).getTime());
  const row = (label: string, value: string) => `
          <tr>
            <td style="padding:6px 0;font-size:13px;color:${P.inkBody};width:120px;">${label}</td>
            <td style="padding:6px 0;font-size:14px;color:${P.dark};font-weight:600;">${value}</td>
          </tr>`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${P.polar};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Good news: ${esc(opts.ticketNo)} is sorted. Not quite right? You can reopen it in one click.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${P.polar};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${P.dark};">
      <tr><td align="center" style="padding:0 0 20px;">
        <img src="${SITE_URL}/logo.png" width="103" height="39" alt="teddy" style="display:block;border:0;" />
      </td></tr>
      <tr><td style="background:${P.white};border-radius:16px;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="background:${P.dark};padding:36px 24px 30px;">
            <div style="width:64px;height:64px;line-height:64px;border-radius:32px;background:${P.mint};color:${P.dark};font-size:32px;font-weight:700;text-align:center;margin:0 auto 16px;">&#10003;</div>
            <div style="font-size:24px;font-weight:700;color:${P.white};line-height:1.3;">Your ticket is resolved</div>
            <div style="font-size:15px;color:${P.sand};margin-top:6px;">Thanks for your patience. We hope everything&rsquo;s comfy again.</div>
          </td></tr>
          <tr><td style="padding:32px 32px 8px;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 14px;">${hi}</p>
            <p style="margin:0 0 20px;">We&rsquo;ve marked your support request as resolved. Here&rsquo;s a quick summary:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${P.polar};border-radius:12px;padding:14px 18px;">
              ${row("Reference", esc(opts.ticketNo))}
              ${row("About", esc(opts.subject))}
              ${row("Opened", dateLabel(opts.openedAt))}
              ${row("Resolved in", took)}
            </table>
          </td></tr>
          <tr><td align="center" style="padding:24px 32px 8px;">
            <a href="${opts.link}" style="display:inline-block;background:${P.dark};color:${P.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:999px;">View your ticket</a>
          </td></tr>
          <tr><td style="padding:16px 32px 32px;font-size:14px;line-height:1.6;color:${P.inkBody};text-align:center;">
            Something still not right? <a href="${opts.link}" style="color:${P.blueBright};font-weight:600;">Reopen your ticket</a> and tell us what&rsquo;s up, or just reply to this email.
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 12px 0;font-size:12px;line-height:1.6;color:${P.greyMid};">
        You&rsquo;re getting this because you contacted Teddy support.<br />
        Reference ${esc(opts.ticketNo)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Returns the ticket's customer token, creating and saving one if it has none.
async function ensureCustomerToken(t: TicketRow): Promise<string> {
  if (t.metadata.customer_token) return t.metadata.customer_token;
  const token = randomBytes(18).toString("base64url");
  t.metadata = { ...t.metadata, customer_token: token };
  await companyOs.from("tasks").update({ metadata: t.metadata }).eq("id", t.id);
  return token;
}

export async function sendResolvedEmail(taskId: string): Promise<void> {
  try {
    const { data } = await companyOs
      .from("tasks")
      .select("id, title, description, created_at, completed_at, board_column_id, metadata")
      .eq("id", taskId)
      .maybeSingle();
    const t = data as TicketRow | null;
    const email = t?.metadata?.customer_email;
    if (!t || !email) return;
    const last = t.metadata.resolved_email_sent_at;
    if (last && Date.now() - new Date(last).getTime() < RESEND_GAP_MS) return;

    const token = await ensureCustomerToken(t);
    const ticketNo = t.metadata.ticket_no ?? "";
    const from = process.env.SUPPORT_EMAIL_FROM || process.env.RESEND_FROM || undefined;
    const sent = await sendTransactionalEmail({
      to: email,
      subject: ticketNo ? `[${ticketNo}] Resolved: ${t.title}` : `Resolved: ${t.title}`,
      html: renderResolvedEmail({
        firstName: t.metadata.customer_name?.trim().split(/\s+/)[0] || null,
        ticketNo,
        subject: t.title,
        openedAt: t.created_at,
        resolvedAt: t.completed_at ?? new Date().toISOString(),
        link: ticketUrl(token),
      }),
      from,
      replyTo: from,
      logMeta: { source: "support_resolved", ticket_no: ticketNo },
    });
    if (!sent) return;
    await companyOs
      .from("tasks")
      .update({ metadata: { ...t.metadata, resolved_email_sent_at: new Date().toISOString() } })
      .eq("id", t.id);
  } catch (err) {
    console.error("[support] resolved email failed:", err);
  }
}
