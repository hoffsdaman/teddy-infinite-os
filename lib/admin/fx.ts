// AUD conversion for deal amounts. Native amount_cents/currency stay the
// transaction record of truth; amount_aud_cents is a derived reporting value
// so cross-currency sums (e.g. deal value on the contacts list) are safe to add.
// AUD is the system's base currency: AUD deals short-circuit — no network
// call, rate is always exactly 1.

const FX_API = "https://api.frankfurter.dev/v1/latest";

export type FxConversion = {
  amountAudCents: number;
  rate: number;
  asOf: string;
};

export async function convertToAudCents(amountCents: number, currency: string): Promise<FxConversion> {
  const code = currency.trim().toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  if (code === "AUD") {
    return { amountAudCents: amountCents, rate: 1, asOf: today };
  }

  const res = await fetch(`${FX_API}?base=${encodeURIComponent(code)}&symbols=AUD`);
  if (!res.ok) throw new Error(`FX lookup failed for ${code}: ${res.status}`);

  const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = data.rates?.AUD;
  if (!rate) throw new Error(`FX lookup returned no AUD rate for ${code}`);

  return {
    amountAudCents: Math.round(amountCents * rate),
    rate,
    asOf: data.date ?? today,
  };
}
