import type { RetreatResource } from "@/lib/my-retreat/content";

// Presentational hub sections (server components). No client interactivity —
// survey cards are links that flip to a "done" state once a matching response
// exists for this guest.

export type SurveyCard = {
  stage: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
};

export function SurveyCards({ items }: { items: SurveyCard[] }) {
  if (items.length === 0) return null;
  return (
    <section className="u-mt-7">
      <h2 className="site-h2">Your surveys</h2>
      <div className="site-card-grid">
        {items.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className={`site-card${s.completed ? " site-card--done" : ""}`}
          >
            <div className="u-dim u-label">
              {s.stage}
            </div>
            <div className="site-card-title">{s.title}</div>
            <p className="u-m-0 u-mb-3 u-lg u-dim-2">{s.description}</p>
            <span className={`site-card-status${s.completed ? " site-card-status--done" : ""}`}>
              {s.completed ? "✓ Completed. Edit your answers" : "Open survey →"}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function ResourceCards({ resources }: { resources: RetreatResource[] }) {
  if (resources.length === 0) return null;
  return (
    <section className="u-mt-7">
      <h2 className="site-h2">Resources</h2>
      <div className="site-card-grid">
        {resources.map((r) => (
          <a
            key={r.href}
            href={r.href}
            className="site-card"
            target={r.href.startsWith("http") ? "_blank" : undefined}
            rel={r.href.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            {r.eyebrow && (
              <div className="u-dim u-label">
                {r.eyebrow}
              </div>
            )}
            <div className="site-card-title">{r.title}</div>
            {r.description && <p className="u-m-0 u-mb-3 u-lg u-dim-2">{r.description}</p>}
            <span className="u-lg u-strong">Open →</span>
          </a>
        ))}
      </div>
    </section>
  );
}
