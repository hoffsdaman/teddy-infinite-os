import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { companyOs } from "@/lib/supabase";
import { sendEventTicketEmail, sendTransactionalEmail } from "@/lib/email";
import { notifyOps } from "@/lib/lark";
import { formatEventDates, ticketPath } from "@/lib/events";
import { newTicketCode } from "@/lib/events-server";
import { getSiteOrigin } from "@/lib/site-origin";

// Stripe webhook — the payment truth this repo has been missing: until now
// orders were written as 'pending' at session-create time and never
// confirmed. Handles two shapes:
//
//  1. Event registrations (session.metadata.type === 'event_registration',
//     created by /events/[slug]): completed → order 'paid' + registration
//     pending_payment → registered + ticket email; expired/failed → seat
//     released (registration cancelled, order expired).
//  2. Everything else with a session id we stamped (saigon-private private
//     sessions, legacy flows): the order found by stripe_session_id is
//     flipped pending → paid/expired. No registration side effects.
//
// Idempotent by construction: every write is guarded by the row's current
// status, so Stripe redeliveries and out-of-order events are no-ops.
//
// Operator setup: add a webhook endpoint in the Stripe dashboard pointing at
// /api/stripe/webhook with checkout.session.completed,
// checkout.session.expired, checkout.session.async_payment_succeeded and
// checkout.session.async_payment_failed, then set STRIPE_WEBHOOK_SECRET
// (prod) / STRIPE_WEBHOOK_TEST_SECRET (dev) from the endpoint's signing
// secret.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set — event dropped.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      // completed with payment still processing (async methods) → wait for
      // async_payment_succeeded instead of marking paid early.
      if (event.type === "checkout.session.completed" && session.payment_status === "unpaid") break;
      await handlePaid(session);
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      await handleFailed(event.data.object as Stripe.Checkout.Session);
      break;
    }
    default:
      break; // subscribed events only; anything else is a config drift no-op
  }

  // Always 200 for verified events — a handler error must not make Stripe
  // retry forever against a permanently failing row.
  return NextResponse.json({ received: true });
}

async function handlePaid(session: Stripe.Checkout.Session) {
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  // Order first (both shapes): pending → paid, guarded by current status.
  // 'expired' is also flippable: infinite-leverage's payment-recovery flow
  // (/pay/[orderId]) re-mints a checkout session after the original expired,
  // so a payment can legitimately arrive on an order this webhook already
  // expired. Payment truth wins.
  const { data: order, error: orderErr } = await companyOs
    .from("orders")
    // No metadata write — a jsonb update would clobber what the checkout
    // flow stored there (booking details). paid-at = updated_at on this row.
    .update({ status: "paid", stripe_payment_intent_id: paymentIntentId })
    .eq("stripe_session_id", session.id)
    .in("status", ["pending", "expired"])
    .select("id")
    .maybeSingle();
  if (orderErr) console.error("[stripe/webhook] order update failed:", orderErr.message);
  if (!order) {
    // Already paid (redelivery) or an order we never recorded — log and move on.
    console.warn("[stripe/webhook] no pending order for session", session.id);
  }

  if (session.metadata?.type === "token_pack") {
    await handleTokenPackPaid(session);
    return;
  }

  // Infinite-leverage retreat checkout (reserve funnel on infiniteleverage-8.com).
  // Fulfilment ported from the old aio-website webhook: registration rows for
  // seat counts, inquiry → won, affiliate commission, buyer confirmation email.
  if (session.metadata?.source_site === "infiniteleverage-8.com") {
    await handleInfiniteLeveragePaid(session);
    return;
  }

  if (session.metadata?.type !== "event_registration") return;
  const registrationId = session.metadata.registration_id;
  if (!registrationId) return;

  const { data: reg, error: regErr } = await companyOs
    .from("event_registrations")
    .update({ status: "registered" })
    .eq("id", registrationId)
    .eq("status", "pending_payment")
    .select("id, ticket_code, attendee_name, attendee_email, confirmation_sent_at, events(title, location, starts_at, ends_at, timezone)")
    .maybeSingle();
  if (regErr) {
    console.error("[stripe/webhook] registration update failed:", regErr.message);
    return;
  }
  if (!reg) return; // redelivery — already flipped

  const eventRow = Array.isArray(reg.events) ? reg.events[0] ?? null : reg.events;
  if (!eventRow || !reg.ticket_code || !reg.attendee_email || reg.confirmation_sent_at) return;

  const sent = await sendEventTicketEmail({
    to: reg.attendee_email,
    name: reg.attendee_name,
    eventTitle: eventRow.title,
    dateLabel: formatEventDates(eventRow.starts_at, eventRow.ends_at, eventRow.timezone),
    location: eventRow.location,
    ticketUrl: `${getSiteOrigin()}${ticketPath(reg.ticket_code)}`,
  });
  if (sent) {
    await companyOs
      .from("event_registrations")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", reg.id);
  }
}

// Attendee rows for team-member add-on seats, from the reserve funnel's
// session metadata. Prefers the "Name <email>; Name" summary in
// metadata.team_members; falls back to a bare count from metadata.add_ons
// ("id:qty,team_member:N"). Ported from the old aio-website webhook.
type AttendeeRow = { name: string | null; email: string | null };

function resolveTeamMemberAttendees(
  metadata: Stripe.Metadata | null | undefined,
): AttendeeRow[] {
  const raw = metadata?.team_members?.trim();
  if (raw) {
    return raw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const match = entry.match(/^(.*?)\s*<([^>]+)>\s*$/);
        if (match) {
          return { name: match[1].trim() || null, email: match[2].trim() || null };
        }
        return { name: entry || null, email: null };
      });
  }
  const addOns = metadata?.add_ons ?? "";
  const teamEntry = addOns
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.startsWith("team_member:"));
  const count = teamEntry ? parseInt(teamEntry.split(":")[1] ?? "0", 10) || 0 : 0;
  return Array.from({ length: count }, () => ({ name: null, email: null }));
}

// Infinite-leverage retreat paid. Every step is idempotent on its own
// (registration insert guarded by an order_id count, inquiry never regresses
// from won, commission guarded by an order_id lookup, buyer email tied to the
// first registration insert) so Stripe redeliveries are safe no-ops.
async function handleInfiniteLeveragePaid(session: Stripe.Checkout.Session) {
  const { data: order, error: orderErr } = await companyOs
    .from("orders")
    .select(
      "id, person_id, product_id, amount_cents, amount_usd_cents, currency, affiliate_id, products(id, title, slug, cohort_slug, tier, location, date_start, date_end, event_id), people(full_name, email)",
    )
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (orderErr || !order) {
    console.error("[stripe/webhook] IL order lookup failed for session", session.id, orderErr?.message);
    return;
  }
  const product = Array.isArray(order.products) ? order.products[0] ?? null : order.products;
  const person = Array.isArray(order.people) ? order.people[0] ?? null : order.people;
  if (!product || !person) {
    console.error("[stripe/webhook] IL order missing product/person joins:", order.id);
    return;
  }

  // 1. Registration rows — one per seat so capacity counts every attendee:
  // the buyer plus any team-member add-on seats. The reserve flow sends
  // attendee details in metadata.team_members ("Name <email>; Name"), seat
  // count mirrored in metadata.add_ons ("team_member:N"). Team rows reuse the
  // buyer's person_id (NOT NULL, booked under the buyer); attendee_name/email
  // distinguish them.
  const { count } = await companyOs
    .from("event_registrations")
    .select("*", { count: "exact", head: true })
    .eq("order_id", order.id);
  const firstFulfilment = (count ?? 0) === 0;

  if (firstFulfilment) {
    const teamRows = resolveTeamMemberAttendees(session.metadata).map((m) => ({
      order_id: order.id,
      product_id: product.id,
      event_id: product.event_id,
      person_id: order.person_id,
      attendee_name: m.name,
      attendee_email: m.email,
      status: "confirmed" as const,
      guest_count: 0,
      ticket_code: newTicketCode(),
    }));
    const { error: regError } = await companyOs.from("event_registrations").insert([
      {
        order_id: order.id,
        product_id: product.id,
        event_id: product.event_id,
        person_id: order.person_id,
        attendee_name: person.full_name,
        attendee_email: person.email,
        status: "confirmed" as const,
        guest_count: 0,
        ticket_code: newTicketCode(),
      },
      ...teamRows,
    ]);
    if (regError) console.error("[stripe/webhook] IL registration insert failed:", regError.message);
  }

  // 2. Latest retreat inquiry for this person → won, payment details merged
  // into metadata. Never regresses an inquiry that is already won.
  const { data: inquiry } = await companyOs
    .from("inquiries")
    .select("id, status, metadata")
    .eq("person_id", order.person_id)
    .eq("type", "retreat")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inquiry) {
    const mergedMeta = {
      ...((inquiry.metadata as Record<string, unknown>) ?? {}),
      payment_method: "stripe",
      payment_amount_cents: order.amount_cents,
      payment_currency: order.currency,
      order_id: order.id,
      product_slug: product.slug,
      ...(product.cohort_slug ? { cohort: product.cohort_slug } : {}),
      ...(product.tier ? { tier: product.tier } : {}),
    };
    const { error: inqError } = await companyOs
      .from("inquiries")
      .update({ status: "won", metadata: mergedMeta })
      .eq("id", inquiry.id);
    if (inqError) console.error("[stripe/webhook] IL inquiry advance failed:", inqError.message);
  } else {
    console.warn("[stripe/webhook] no retreat inquiry found for IL person", order.person_id);
  }

  // 3. Commission ledger — only when the customer used a commission-type code
  // (discount conversions earn nothing; the discount was the compensation).
  // gross is USD-settled when the order carries amount_usd_cents (AUD orders).
  const codeType = session.metadata?.affiliate_code_type;
  if (order.affiliate_id && codeType === "commission") {
    const { data: existingCommission } = await companyOs
      .from("affiliate_commissions")
      .select("id")
      .eq("order_id", order.id)
      .eq("source_event", "order_paid")
      .limit(1)
      .maybeSingle();
    if (!existingCommission) {
      const { data: aff } = await companyOs
        .from("affiliates")
        .select("id, rate")
        .eq("id", order.affiliate_id)
        .maybeSingle();
      if (aff) {
        const grossCents = order.amount_usd_cents ?? order.amount_cents;
        const { error: commError } = await companyOs.from("affiliate_commissions").insert({
          affiliate_id: aff.id,
          order_id: order.id,
          source_event: "order_paid",
          source_ref: session.id,
          gross_cents: grossCents,
          rate: aff.rate,
          commission_cents: Math.round(grossCents * aff.rate),
          notes: `Infinite Leverage ${product.title} (${order.currency.toUpperCase()} order, gross in USD).`,
        });
        if (commError) console.error("[stripe/webhook] IL commission insert failed:", commError.message);
      }
    }
  }

  // 4. Buyer confirmation + ops ping, first fulfilment only.
  if (firstFulfilment) {
    const amountLabel = `${order.currency.toUpperCase()} $${(order.amount_cents / 100).toLocaleString()}`;
    // Day-granular label; AUD cohorts run in Australia, everything else in Vietnam.
    const tz = order.currency === "aud" ? "Australia/Sydney" : "Asia/Ho_Chi_Minh";
    const dateLabel = product.date_start
      ? formatEventDates(product.date_start, product.date_end, tz)
      : null;
    if (person.email) {
      const firstName = person.full_name?.split(" ")[0] || "there";
      await sendTransactionalEmail({
        to: person.email,
        subject: `You're in: ${product.title}`,
        html: `
          <p>Hi ${firstName},</p>
          <p>Your payment of <strong>${amountLabel}</strong> for <strong>${product.title}</strong> is confirmed — your seat is locked in.</p>
          ${dateLabel ? `<p><strong>Dates:</strong> ${dateLabel}${product.location ? ` · ${product.location}` : ""}</p>` : ""}
          <p>We'll follow up before the event with everything you need to prepare. Reply to this email any time with questions.</p>
          <p>Dave and the Infinite Leverage team</p>
        `.trim(),
        replyTo: "dave@edge8.co",
        logMeta: { source: "il_retreat_paid" },
      });
    }
    await notifyOps(
      `🌴 Retreat paid: ${person.full_name ?? person.email ?? "someone"} — ${product.title}, ${amountLabel}.`,
    );
  }
}

// Human-token pack paid: flip the purchase (guarded pending → paid, so
// redeliveries no-op), then receipts — client email, accountant email, ops
// Lark — only on the first flip.
async function handleTokenPackPaid(session: Stripe.Checkout.Session) {
  const purchaseId = session.metadata?.token_purchase_id;
  if (!purchaseId) return;

  const { data: purchase, error } = await companyOs
    .from("token_purchases")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .eq("status", "pending")
    .select("id, packs, tokens, amount_cents, company_id, person_id")
    .maybeSingle();
  if (error) {
    console.error("[stripe/webhook] token purchase update failed:", error.message);
    return;
  }
  if (!purchase) return; // redelivery — already flipped

  const [{ data: person }, { data: company }] = await Promise.all([
    companyOs.from("people").select("full_name, email").eq("id", purchase.person_id).maybeSingle(),
    companyOs.from("companies").select("name").eq("id", purchase.company_id).maybeSingle(),
  ]);

  const amountLabel = `$${(purchase.amount_cents / 100).toLocaleString()}`;
  const toEmail = session.customer_email || person?.email;
  if (toEmail) {
    const name = person?.full_name?.split(" ")[0] || "there";
    await sendTransactionalEmail({
      to: toEmail,
      subject: `Your TeddyBed OS human tokens: ${purchase.tokens} hours`,
      html: `
        <p>Hi ${name},</p>
        <p>Thanks — your payment of <strong>${amountLabel}</strong> for ${purchase.packs} ${
          purchase.packs === 1 ? "pack" : "packs"
        } (<strong>${purchase.tokens} human tokens</strong>, 1 token = 1 hour of skilled work) is confirmed.</p>
        <p>Your balance is live in your portal: ${getSiteOrigin()}/portal/tokens</p>
        <p style="margin-top:24px;">Reply to this email any time to put them to work.</p>
        <p>Dave and the TeddyBed OS team</p>
      `.trim(),
      replyTo: "dave@edge8.co",
    });
  }
  if (process.env.ACCOUNTING_EMAIL) {
    await sendTransactionalEmail({
      to: process.env.ACCOUNTING_EMAIL,
      subject: `Token pack purchase: ${company?.name ?? "client"} — ${amountLabel}`,
      html: `<p>${company?.name ?? "A client"} bought ${purchase.packs} human-token ${
        purchase.packs === 1 ? "pack" : "packs"
      } (${purchase.tokens} tokens) for ${amountLabel} via Stripe. Paid by ${toEmail ?? "unknown"}.</p>`,
      replyTo: "dave@edge8.co",
    });
  }
  await notifyOps(
    `🪙 Token packs purchased: ${company?.name ?? "client"} — ${purchase.packs} ${
      purchase.packs === 1 ? "pack" : "packs"
    } / ${purchase.tokens} tokens, ${amountLabel}.`,
  );
}

async function handleFailed(session: Stripe.Checkout.Session) {
  const { error: orderErr } = await companyOs
    .from("orders")
    .update({ status: "expired" })
    .eq("stripe_session_id", session.id)
    .eq("status", "pending");
  if (orderErr) console.error("[stripe/webhook] order expire failed:", orderErr.message);

  if (session.metadata?.type === "token_pack") {
    const purchaseId = session.metadata.token_purchase_id;
    if (purchaseId) {
      const { error } = await companyOs
        .from("token_purchases")
        .update({ status: "expired" })
        .eq("id", purchaseId)
        .eq("status", "pending");
      if (error) console.error("[stripe/webhook] token purchase expire failed:", error.message);
    }
    return;
  }

  if (session.metadata?.type !== "event_registration") return;
  const registrationId = session.metadata.registration_id;
  if (!registrationId) return;

  // Release the held seat: cancelled rows don't count against capacity in
  // the register_for_event RPC, so the seat frees up immediately.
  const { error: regErr } = await companyOs
    .from("event_registrations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("status", "pending_payment");
  if (regErr) console.error("[stripe/webhook] registration release failed:", regErr.message);
}
