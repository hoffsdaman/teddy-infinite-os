import Anthropic from "@anthropic-ai/sdk";
import { readTextOutput } from "@/lib/ai/response";

// Parse one inbound email into the few fields a support ticket actually needs,
// instead of dumping the raw body onto the card. A marketing newsletter or a
// vendor notification becomes a mile of HTML-to-text noise; a real customer
// message becomes a clean two-line summary plus any order number they quoted.
//
// The parse also classifies whether the email is genuine customer support at
// all (is_support), so the poller can label-and-skip automated / marketing /
// vendor mail rather than filing it as a ticket.
//
// Mirrors lib/resume-extract.ts: Haiku, JSON-schema output, one usage line.

const MODEL = "claude-haiku-4-5";

export type ParsedEmail = {
  // False for marketing, newsletters, receipts, delivery/vendor notifications,
  // auto-replies, and anything not a person asking for help.
  is_support: boolean;
  // A short, human subject for the ticket card (the raw subject is often junky
  // or emoji-laden). <= 90 chars.
  subject: string;
  // 1–3 plain sentences: what the customer wants / their problem. This becomes
  // the ticket description in place of the raw body.
  summary: string;
  // The customer's name if discernible from the signature/body, else null.
  customer_name: string | null;
  // Any order number the customer quotes (e.g. "TED184316", "#1042"), else null.
  order_number: string | null;
  // Coarse intake bucket, or null if unclear.
  category: "delivery" | "returns" | "product" | "warranty" | "billing" | "other" | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_support", "subject", "summary", "customer_name", "order_number", "category"],
  properties: {
    is_support: {
      type: "boolean",
      description:
        "true only if this is a genuine customer contacting support (a question, problem, complaint, or request about their order or a product). false for marketing, newsletters, promotions, order/shipping notifications, receipts, vendor/app notifications, and automated no-reply mail.",
    },
    subject: {
      type: "string",
      description: "A short, clear ticket subject describing the request, composed by you. Max 90 characters. No emoji.",
    },
    summary: {
      type: "string",
      description:
        "1–3 plain sentences stating what the customer wants and any specifics (dates, product, issue). Transcribe facts; do not invent. For non-support mail, one sentence saying what it is.",
    },
    customer_name: {
      type: ["string", "null"],
      description: "The sender's name from the signature or body. null if not stated.",
    },
    order_number: {
      type: ["string", "null"],
      description: "An order number the customer quotes, exactly as written (e.g. 'TED184316', '#1042'). null if none.",
    },
    category: {
      type: "string",
      enum: ["delivery", "returns", "product", "warranty", "billing", "other"],
      description: "Coarse category of the request. Use 'other' if unclear or not a support email.",
    },
  },
} as const;

const SYSTEM = `You triage inbound email for a mattress retailer's (Teddy) customer-support inbox. You do two jobs: decide whether an email is a genuine customer support message, and distill a real one into a short ticket. Copy facts (names, order numbers, dates) exactly — never invent them. Be strict about is_support: promotional, transactional, and automated mail is not support.`;

type Ok = { ok: true; parsed: ParsedEmail };
type Err = { ok: false; error: string };

const clean = (s: string | null): string | null => (typeof s === "string" && s.trim() ? s.trim() : null);

export async function parseSupportEmail(input: {
  from: string;
  name: string | null;
  subject: string;
  body: string;
}): Promise<Ok | Err> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    // Cap the body we send — a newsletter can be enormous, and the head carries
    // the intent. Keeps token cost bounded on the noisy inbox.
    const body = input.body.length > 8000 ? `${input.body.slice(0, 8000)}\n…[truncated]` : input.body;

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `From: ${input.name ? `${input.name} <${input.from}>` : input.from}\nSubject: ${input.subject}\n\n${body}`,
            },
          ],
        },
      ],
    });

    const out = readTextOutput("support-email-parse", MODEL, response, "The model declined to parse this email.");
    if (!out.ok) return { ok: false, error: out.error };

    const p = JSON.parse(out.text) as ParsedEmail;
    const subject = clean(p.subject) || input.subject || "(no subject)";
    return {
      ok: true,
      parsed: {
        is_support: Boolean(p.is_support),
        subject: subject.slice(0, 120),
        summary: clean(p.summary) || "(no summary)",
        customer_name: clean(p.customer_name) ?? input.name,
        order_number: clean(p.order_number),
        category: p.category ?? null,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[support-email-parse] ${input.from} failed:`, msg);
    return { ok: false, error: msg };
  }
}
