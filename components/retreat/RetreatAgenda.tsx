import {
  groupAgendaByDay,
  PERIOD_LABELS,
  STAFF_ROLE_LABELS,
  type AgendaBlock,
} from "@/lib/admin/event-agenda-shared";

// Shared, presentational agenda renderer used in two places from one data
// source (docs/plans/2026-07-31-my-retreat-design.md):
//   view="guest" → the "My Retreat" itinerary. Guest-visible blocks only,
//                  staff hidden.
//   view="ops"   → the internal work schedule. Every block, plus who works it.
// Self-contained inline styles so it renders the same inside the admin console
// and the marketing hub. No client hooks — safe as a server component.

const timeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: 13,
  letterSpacing: "0.02em",
  color: "var(--admin-muted)",
};

export function RetreatAgenda({ blocks, view }: { blocks: AgendaBlock[]; view: "guest" | "ops" }) {
  const days = groupAgendaByDay(blocks, view);
  if (days.length === 0) {
    return <p style={{ opacity: 0.7, margin: 0 }}>No agenda yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {days.map((day) => (
        <section key={day.dayIndex}>
          <header style={{ marginBottom: 8, display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: 999, background: "var(--admin-ink)", flexShrink: 0 }}
            />
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>
              {day.dayLabel || `Day ${day.dayIndex}`}
            </div>
            {!day.dayLabel && day.dayDate && <div style={timeStyle}>{formatDay(day.dayDate)}</div>}
          </header>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {day.blocks.map((b) => (
              <div
                key={b.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr",
                  gap: 16,
                  padding: "12px 0",
                  borderTop: "1px solid var(--admin-line)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={timeStyle}>{timeText(b)}</span>
                  {view === "ops" && b.staff.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {b.staff.map((s) => (
                        <span
                          key={s.id}
                          title={STAFF_ROLE_LABELS[s.role]}
                          style={{
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: 999,
                            background: "var(--admin-tint)",
                            color: "var(--admin-ink)",
                          }}
                        >
                          {s.personName ?? "Unknown"} · {STAFF_ROLE_LABELS[s.role]}
                        </span>
                      ))}
                    </div>
                  )}
                  {view === "ops" && !b.guestVisible && (
                    <span style={{ fontSize: 11, color: "var(--admin-muted)" }}>ops only</span>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 600 }}>{b.title}</div>
                  {b.body && <p style={{ margin: "4px 0 0", lineHeight: 1.5 }}>{b.body}</p>}
                  {b.room && (
                    <div style={{ ...timeStyle, marginTop: 4 }}>Room: {b.room}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function timeText(b: AgendaBlock): string {
  if (b.timeLabel) return b.timeLabel;
  if (b.period) return PERIOD_LABELS[b.period];
  return "";
}

function formatDay(date: string): string {
  const t = Date.parse(date.slice(0, 10));
  if (Number.isNaN(t)) return date;
  return new Date(t).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
