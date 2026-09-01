import type { Metadata } from "next";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = {
  title: "Contact Support · TeddyBed",
  description: "Get help with your TeddyBed order, mattress, or account. We usually reply within a day.",
};

export default function SupportPage() {
  return (
    <main style={{ minHeight: "70vh", padding: "72px 0 96px", background: "linear-gradient(180deg, #f6f7fb 0%, #ffffff 100%)" }}>
      <div className="container" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <span
            style={{
              display: "inline-block",
              background: "var(--mint, #b8f2e6)",
              color: "var(--dark, #1a1a2e)",
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 12px",
              borderRadius: 40,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Support
          </span>
          <h1 style={{ fontFamily: "var(--font-display, inherit)", fontSize: 40, margin: "0 0 10px", color: "var(--dark, #1a1a2e)" }}>
            How can we help?
          </h1>
          <p style={{ fontSize: 17, color: "rgba(0,0,0,0.6)", margin: 0 }}>
            Tell us what&rsquo;s going on and we&rsquo;ll get back to you. You&rsquo;ll get a reference number right away.
          </p>
        </div>
        <SupportForm />
      </div>
    </main>
  );
}
