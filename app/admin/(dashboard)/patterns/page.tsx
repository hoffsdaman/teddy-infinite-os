import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHead } from "@/components/admin/PageHead";
import { Badge } from "@/components/admin/Badge";
import { MetricCard } from "@/components/admin/MetricCard";
import { PersonSelectDemo } from "./PersonSelectDemo";

export const metadata: Metadata = {
  title: "Pattern library",
};

// Living style guide for the 8 Edges admin design system. Renders every token
// and component using the real .admin-* classes, so it tracks admin.css exactly
// and serves as the QA reference for the redesign. Not linked in the sidebar nav
// by design; reach it directly at /admin/patterns.

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="admin-card admin-section-card pat-section">
      <h2 className="admin-card-title" style={{ marginBottom: sub ? 4 : 14 }}>{title}</h2>
      {sub && <p className="pat-caption" style={{ marginTop: 0, marginBottom: 14 }}>{sub}</p>}
      {children}
    </section>
  );
}

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="pat-swatch">
      <div className="pat-swatch-chip" style={{ background: `var(${varName})` }} />
      <div>
        <div className="pat-swatch-name">{name}</div>
        <div className="pat-swatch-meta">{varName}</div>
      </div>
    </div>
  );
}

function TypeRow({ meta, size, weight, children }: { meta: string; size: number; weight?: number; children: ReactNode }) {
  return (
    <div className="pat-type-row">
      <span className="pat-type-meta">{meta}</span>
      <span style={{ fontSize: size, fontWeight: weight ?? 400, color: "var(--admin-ink)", lineHeight: 1.3 }}>
        {children}
      </span>
    </div>
  );
}

export default function PatternsPage() {
  return (
    <div>
      <PageHead
        eyebrow="Design system"
        title="Pattern library"
        sub="The living reference for the 8 Edges admin. Every token and component below renders the real admin.css classes, so this page tracks the system exactly."
        action={<button className="admin-btn admin-btn--primary" type="button">Primary action</button>}
      />

      <div className="pat-stack">
        {/* ─── Typography ─────────────────────────────── */}
        <Section title="Typography" sub="Manrope everywhere. Numerics align with tabular-nums, not a second face. 13px base; steps are --admin-text-xs … --admin-text-kpi in app/styles/tokens.css.">
          <div style={{ marginBottom: 16 }}>
            <TypeRow meta="26 / 600" size={26} weight={600}>Page title</TypeRow>
            <TypeRow meta="18 / 600" size={18} weight={600}>Drawer / modal title</TypeRow>
            <TypeRow meta="15 / 600" size={15} weight={600}>Card title</TypeRow>
            <TypeRow meta="13.5 / 600" size={13.5} weight={600}>Emphasis / cell strong</TypeRow>
            <TypeRow meta="13 / 400" size={13}>Body text — the default reading size across the admin.</TypeRow>
            <TypeRow meta="12.5 / 400" size={12.5}>Secondary / labels</TypeRow>
            <TypeRow meta="12 / 600" size={12} weight={600}>UPPERCASE EYEBROW</TypeRow>
          </div>
          <div className="pat-row">
            <span style={{ fontFamily: "var(--admin-font-mono)", fontSize: 14, color: "var(--admin-ink)", fontVariantNumeric: "tabular-nums" }}>
              $12,480.00 · 1,204 · 2026-07-06 · #E8-1042
            </span>
            <span className="pat-swatch-meta">Manrope, tabular numerics</span>
          </div>
        </Section>

        {/* ─── Color ──────────────────────────────────── */}
        <Section title="Brand primitives" sub="The Teddy palette (Brand Guidelines V.1), §1 of app/styles/tokens.css. Every role token below aliases onto one of these.">
          <div className="pat-swatches">
            <Swatch name="Yogi" varName="--teddy-yogi" />
            <Swatch name="Booboo" varName="--teddy-booboo" />
            <Swatch name="Sand" varName="--teddy-sand" />
            <Swatch name="Polar" varName="--teddy-polar" />
            <Swatch name="Winnie" varName="--teddy-winnie" />
          </div>
        </Section>

        <Section title="Color — accent" sub="Default accent is Yogi teal (there is no blue in-brand). Per-section themes override --admin-accent only.">
          <div className="pat-swatches">
            <Swatch name="Accent" varName="--admin-accent" />
            <Swatch name="Accent strong" varName="--admin-accent-strong" />
            <Swatch name="Accent soft" varName="--admin-accent-soft" />
          </div>
        </Section>

        <Section title="Color — office accents" sub="Four brand steps for per-office themes and badges. Legacy var names kept.">
          <div className="pat-swatches">
            <Swatch name="Teal" varName="--admin-accent-blue" />
            <Swatch name="Deep teal" varName="--admin-accent-green" />
            <Swatch name="Yogi" varName="--admin-accent-pink" />
            <Swatch name="Gray" varName="--admin-accent-gold" />
          </div>
        </Section>

        <Section title="Color — neutrals">
          <div className="pat-swatches">
            <Swatch name="Ink" varName="--admin-ink" />
            <Swatch name="Ink 2" varName="--admin-ink-2" />
            <Swatch name="Muted" varName="--admin-muted" />
            <Swatch name="Faint" varName="--admin-faint" />
            <Swatch name="Line" varName="--admin-line" />
            <Swatch name="Line soft" varName="--admin-line-soft" />
            <Swatch name="Background" varName="--admin-bg" />
            <Swatch name="Surface" varName="--admin-surface" />
          </div>
        </Section>

        <Section title="Color — sidebar chrome">
          <div className="pat-swatches">
            <Swatch name="Sidebar bg" varName="--admin-sidebar-bg" />
            <Swatch name="Sidebar strong" varName="--admin-sidebar-strong" />
            <Swatch name="Sidebar ink" varName="--admin-sidebar-ink" />
            <Swatch name="Sidebar muted" varName="--admin-sidebar-muted" />
          </div>
        </Section>

        <Section title="Color — status">
          <div className="pat-swatches">
            <Swatch name="Success" varName="--admin-ok-bg" />
            <Swatch name="Warning" varName="--admin-warn-bg" />
            <Swatch name="Error" varName="--admin-err-bg" />
            <Swatch name="Info" varName="--admin-info-bg" />
            <Swatch name="Pink" varName="--admin-pink-bg" />
            <Swatch name="Neutral" varName="--admin-muted-bg" />
          </div>
        </Section>

        {/* ─── Radii + shadows ────────────────────────── */}
        <Section title="Radius">
          <div className="pat-grid">
            <div className="pat-swatch">
              <div className="pat-radius-chip" style={{ borderRadius: "var(--admin-radius-xs)" }} />
              <div className="pat-swatch-name">6px · xs<div className="pat-swatch-meta">--admin-radius-xs</div></div>
            </div>
            <div className="pat-swatch">
              <div className="pat-radius-chip" style={{ borderRadius: "var(--admin-radius-sm)" }} />
              <div className="pat-swatch-name">8px · sm<div className="pat-swatch-meta">--admin-radius-sm</div></div>
            </div>
            <div className="pat-swatch">
              <div className="pat-radius-chip" style={{ borderRadius: "var(--admin-radius)" }} />
              <div className="pat-swatch-name">12px · lg<div className="pat-swatch-meta">--admin-radius</div></div>
            </div>
            <div className="pat-swatch">
              <div className="pat-radius-chip" style={{ borderRadius: "var(--admin-radius-pill)" }} />
              <div className="pat-swatch-name">pill<div className="pat-swatch-meta">--admin-radius-pill</div></div>
            </div>
          </div>
        </Section>

        <Section title="Shadow" sub="Navy-tinted. Drawer and modal shadows appear on their overlays.">
          <div className="pat-grid">
            <div className="pat-swatch">
              <div className="pat-shadow-chip" style={{ boxShadow: "var(--admin-shadow)" }} />
              <div className="pat-swatch-name">Card<div className="pat-swatch-meta">--admin-shadow</div></div>
            </div>
            <div className="pat-swatch">
              <div className="pat-shadow-chip" style={{ boxShadow: "var(--admin-shadow-md)" }} />
              <div className="pat-swatch-name">Raised<div className="pat-swatch-meta">--admin-shadow-md</div></div>
            </div>
            <div className="pat-swatch">
              <div className="pat-shadow-chip" style={{ boxShadow: "var(--admin-shadow-modal)" }} />
              <div className="pat-swatch-name">Modal<div className="pat-swatch-meta">--admin-shadow-modal</div></div>
            </div>
          </div>
        </Section>

        {/* ─── Buttons ────────────────────────────────── */}
        <Section title="Buttons">
          <div className="pat-row">
            <button className="admin-btn admin-btn--primary" type="button">Primary</button>
            <button className="admin-btn" type="button">Default</button>
            <button className="admin-btn admin-btn--danger" type="button">Danger</button>
            <button className="admin-btn admin-btn--sm" type="button">Small</button>
            <button className="admin-btn admin-btn--primary" type="button" disabled>Disabled</button>
          </div>
        </Section>

        {/* ─── Badges ─────────────────────────────────── */}
        <Section title="Badges &amp; pills">
          <div className="pat-row" style={{ marginBottom: 12 }}>
            <Badge>Neutral</Badge>
            <Badge tone="ok">Won</Badge>
            <Badge tone="warn">Pending</Badge>
            <Badge tone="err">Lost</Badge>
            <Badge tone="info">New lead</Badge>
            <span className="admin-badge admin-badge--pink">Partner</span>
          </div>
          <div className="pat-row">
            <Badge tone="ok" dot>Active</Badge>
            <Badge tone="warn" dot>On hold</Badge>
            <Badge tone="err" dot>Blocked</Badge>
          </div>
        </Section>

        {/* ─── Forms ──────────────────────────────────── */}
        <Section title="Forms" sub="Focus shows the accent ring (--admin-focus-ring).">
          <div className="admin-form" style={{ maxWidth: 420 }}>
            <div className="admin-field">
              <label className="admin-label">Full name</label>
              <input className="admin-input" defaultValue="Jane Doe" />
              <span className="admin-hint">As it appears on their profile.</span>
            </div>
            <div className="admin-field">
              <label className="admin-label">Persona</label>
              <select className="admin-select" defaultValue="client">
                <option value="prospect">Prospect</option>
                <option value="client">Client</option>
                <option value="employee">Employee</option>
              </select>
            </div>
            <div className="admin-field">
              <label className="admin-label">Notes</label>
              <textarea className="admin-textarea" defaultValue="Followed up after the discovery call." />
            </div>
            <label className="admin-timeoff-check">
              <input type="checkbox" defaultChecked /> Do not contact
            </label>
          </div>
        </Section>

        {/* ─── Person picker ──────────────────────────── */}
        <Section
          title="Person picker"
          sub="Every place a person is chosen. Never hand-roll a <select> of names: the roster is around fifty rows and a plain select has no way to find anyone."
        >
          <PersonSelectDemo />
          <p className="pat-caption" style={{ marginTop: 14, marginBottom: 0 }}>
            Feed it from <code>listAssignablePeople()</code> in <code>lib/admin/people-options</code>, which returns
            only people currently on the roster (employees and contractors alike) with names taken from
            <code> people.display_name</code> and ordered by first name. Labels come from
            <code> personName()</code> in <code>lib/people-name</code>, never from <code>full_name</code> directly.
          </p>
        </Section>

        {/* ─── Table ──────────────────────────────────── */}
        <Section title="Data table">
          <div className="admin-toolbar">
            <div className="admin-search">
              <span aria-hidden>🔍</span>
              <input placeholder="Search people" defaultValue="" />
            </div>
            <select className="admin-select" style={{ width: "auto" }} defaultValue="">
              <option value="">Persona: All</option>
              <option value="client">Client</option>
            </select>
          </div>
          <div className="admin-table-wrap">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Persona</th>
                    <th>Stage</th>
                    <th style={{ textAlign: "right" }}>Deal value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="is-clickable">
                    <td className="admin-cell-strong">Jane Doe</td>
                    <td>Client</td>
                    <td><Badge tone="ok" dot>Customer</Badge></td>
                    <td className="admin-cell-mono" style={{ textAlign: "right" }}>$12,480.00</td>
                  </tr>
                  <tr className="is-clickable">
                    <td className="admin-cell-strong">Minh Tran</td>
                    <td className="admin-cell-muted">Prospect</td>
                    <td><Badge tone="warn" dot>Lead</Badge></td>
                    <td className="admin-cell-mono" style={{ textAlign: "right" }}>$3,200.00</td>
                  </tr>
                  <tr className="is-clickable">
                    <td className="admin-cell-strong">Acme Co.</td>
                    <td className="admin-cell-muted">Client</td>
                    <td><Badge tone="info" dot>Open</Badge></td>
                    <td className="admin-cell-mono" style={{ textAlign: "right" }}>$48,000.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="admin-pagination">
              <span>3 of 128</span>
              <div className="admin-pagination-controls">
                <span className="admin-pagebtn" aria-disabled="true">Prev</span>
                <span className="admin-pagebtn">Next</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ─── Clickable rows + side car ──────────────── */}
        <Section
          title="Clickable rows &amp; side car"
          sub="In CRM lists the whole row is the click target and opens the record in the side car (the right-hand drawer shown lower down). The name is not a separate link."
        >
          <div className="admin-table-wrap">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Persona</th>
                    <th style={{ textAlign: "right" }}>Deal value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="is-clickable" tabIndex={0} role="button" aria-haspopup="dialog">
                    <td className="admin-cell-strong">Jane Doe</td>
                    <td><Badge tone="ok" dot>Customer</Badge></td>
                    <td className="admin-cell-mono" style={{ textAlign: "right" }}>$12,480.00</td>
                  </tr>
                  <tr className="is-clickable" tabIndex={0} role="button" aria-haspopup="dialog">
                    <td className="admin-cell-strong">Minh Tran</td>
                    <td><Badge tone="warn" dot>Lead</Badge></td>
                    <td className="admin-cell-mono" style={{ textAlign: "right" }}>$3,200.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="pat-caption">
            Hover a row to see the accent-tinted affordance. Wire it with DataTable&rsquo;s
            getRowPreview, or the PreviewRow component for bespoke tables.
          </p>
        </Section>

        {/* ─── Tabs + segmented ───────────────────────── */}
        <Section title="Tabs &amp; segmented control">
          <div className="admin-tabs">
            <button className="admin-tab is-active" type="button">Overview</button>
            <button className="admin-tab" type="button">Activity</button>
            <button className="admin-tab" type="button">Deals</button>
          </div>
          <div className="admin-viewtoggle" style={{ marginTop: 4 }}>
            <button className="is-active" type="button">Board</button>
            <button type="button">List</button>
          </div>
        </Section>

        {/* ─── KPI tiles ──────────────────────────────── */}
        <Section title="KPI tiles">
          <div className="mp-kpi-grid" style={{ marginBottom: 0 }}>
            <MetricCard label="Pipeline" value="$248,000" sub="18 open deals" />
            <MetricCard label="Won this month" value="$52,400" sub="+12% vs last" />
            <MetricCard label="Active contacts" value="1,204" sub="Company database" />
            <MetricCard label="Open roles" value="7" sub="Across 3 clients" />
          </div>
        </Section>

        {/* ─── Alerts ─────────────────────────────────── */}
        <Section title="Inline alerts">
          <div className="pat-stack" style={{ maxWidth: 520 }}>
            <div className="admin-alert admin-alert--ok">Changes saved.</div>
            <div className="admin-alert admin-alert--err">Could not save. Check the highlighted fields.</div>
          </div>
        </Section>

        {/* ─── Detail: key/value + list ───────────────── */}
        <Section title="Detail — key / value">
          <dl className="admin-kv" style={{ maxWidth: 420 }}>
            <dt>Email</dt>
            <dd>jane@acme.co</dd>
            <dt>Phone</dt>
            <dd>+84 90 123 4567</dd>
            <dt>Source</dt>
            <dd>Edge8</dd>
            <dt>Created</dt>
            <dd className="admin-cell-mono">2026-07-06</dd>
          </dl>
        </Section>

        {/* ─── Kanban card ────────────────────────────── */}
        <Section title="Kanban column &amp; card">
          <div style={{ maxWidth: 300 }}>
            <div className="sap-col">
              <div className="sap-col-head">
                <span className="sap-col-dot" style={{ background: "var(--admin-accent)" }} />
                <span className="sap-col-label">Discovery</span>
                <span className="sap-col-count">2</span>
              </div>
              <div className="sap-col-body">
                <div className="sap-card">
                  <div className="sap-card-title">Acme Co. — Pilot</div>
                  <div className="sap-card-sub">Jane Doe</div>
                  <div className="sap-card-meta">
                    <Badge tone="warn" dot>60%</Badge>
                    <span className="admin-cell-mono" style={{ fontSize: 12 }}>$48,000</span>
                  </div>
                </div>
                <div className="sap-card">
                  <div className="sap-card-title">Globex — Retainer</div>
                  <div className="sap-card-sub">Minh Tran</div>
                </div>
              </div>
              <div className="sap-col-foot">
                Total
                <span className="sap-card-sub">$51,200</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ─── Toasts ─────────────────────────────────── */}
        <Section title="Toasts" sub="Runtime overlays. Shown here in place.">
          <div className="pat-toast-host">
            <div className="admin-toast">Saved to the company database.</div>
            <div className="admin-toast admin-toast--ok">Deal moved to Won.</div>
            <div className="admin-toast admin-toast--err">Network error. Retry.</div>
          </div>
        </Section>

        {/* ─── Modal + drawer facsimile ───────────────── */}
        <Section title="Modal">
          <div className="admin-modal" style={{ margin: 0 }}>
            <div className="admin-modal-title">Archive this contact?</div>
            <div className="admin-modal-body">They will be hidden from lists but can be restored. Their deals and history are kept.</div>
            <div className="admin-modal-actions">
              <button className="admin-btn" type="button">Cancel</button>
              <button className="admin-btn admin-btn--danger" type="button">Archive</button>
            </div>
          </div>
        </Section>

        <Section title="Drawer header" sub="The live drawer slides in from the right; the header pattern is shown here.">
          <div className="admin-card" style={{ maxWidth: 460, overflow: "hidden" }}>
            <div className="admin-drawer-head">
              <div>
                <div className="admin-drawer-eyebrow">Contact</div>
                <div className="admin-drawer-title">Jane Doe</div>
              </div>
              <button className="admin-drawer-close" type="button" aria-label="Close">×</button>
            </div>
            <div className="admin-drawer-body">
              <dl className="admin-kv">
                <dt>Persona</dt>
                <dd>Client</dd>
                <dt>Owner</dt>
                <dd>Unassigned</dd>
              </dl>
            </div>
          </div>
        </Section>

        {/* ─── Danger zone ────────────────────────────── */}
        <Section title="Danger zone">
          <div className="admin-danger-zone" style={{ maxWidth: 560 }}>
            <div className="admin-danger-zone-title">Danger zone</div>
            <div className="admin-danger-row">
              <div className="admin-danger-row-text">Permanently erase this person and all associated records. This cannot be undone.</div>
              <button className="admin-btn admin-btn--danger admin-btn--sm" type="button">Erase</button>
            </div>
          </div>
        </Section>

        {/* ─── Empty state ────────────────────────────── */}
        <Section title="Empty state">
          <div className="admin-table-wrap">
            <div className="admin-empty">No results match these filters.</div>
          </div>
        </Section>
      </div>
    </div>
  );
}
