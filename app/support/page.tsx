import type { Metadata } from "next";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = {
  title: "Contact Support · TeddyBed",
  description: "Get help with your TeddyBed order, mattress, or account. We usually reply within a day.",
};

export default function SupportPage() {
  return (
    <main className="site-support-main">
      <div className="container u-mx-auto u-max-7">
        <div className="u-mb-6 u-center-text">
          <span
            className="site-badge-mint u-mb-4"
          >
            Support
          </span>
          <h1 className="site-support-title">
            How can we help?
          </h1>
          <p className="site-support-sub u-m-0">
            Tell us what&rsquo;s going on and we&rsquo;ll get back to you. You&rsquo;ll get a reference number right away.
          </p>
        </div>
        <SupportForm />
      </div>
    </main>
  );
}
