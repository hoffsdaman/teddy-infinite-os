// The .tcr scoped styles for the team roadmap rendering (group heads, item
// cards, priority pills), shared by the company-wide Roadmap tab and the AI
// Program view's Roadmap tab so both render identically.

export const ROADMAP_STYLES = `
.tcr { --pri-now:var(--admin-accent); --pri-next:var(--admin-ok-strong); --pri-later:var(--admin-muted-ink); --pri-park:var(--admin-amber-ink); max-width: 880px; }
.tcr .tcr-group { margin-bottom: 22px; }
.tcr .tcr-group-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0 0 4px; }
.tcr .tcr-step { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:3px 9px; border-radius:99px; background:color-mix(in srgb, var(--admin-accent) 10%, transparent); color:var(--admin-accent); }
.tcr .tcr-group-title { font-weight:700; font-size:15px; }
.tcr .tcr-group-intro { color:var(--admin-ink-2); font-size:13px; margin:2px 0 12px; }
.tcr .tcr-item { border:1px solid var(--admin-line); border-radius:12px; padding:13px 15px; margin-bottom:9px; background:var(--admin-surface); }
.tcr .tcr-item-top { display:flex; gap:9px; align-items:flex-start; flex-wrap:wrap; }
.tcr .tcr-ref { flex:none; font-size:12px; font-weight:700; color:var(--admin-accent); background:color-mix(in srgb, var(--admin-accent) 10%, transparent); border-radius:6px; padding:3px 7px; }
.tcr .tcr-title { font-weight:650; font-size:14px; flex:1 1 220px; }
.tcr .tcr-pri { flex:none; font-size:12px; font-weight:700; padding:4px 11px; border-radius:99px; }
.tcr .tcr-pri.now { background:var(--pri-now); color:var(--color-bg-primary); }
.tcr .tcr-pri.next { background:color-mix(in srgb, var(--admin-ok-strong) 15%, transparent); color:var(--pri-next); }
.tcr .tcr-pri.later { background:var(--admin-surface-2); color:var(--pri-later); }
.tcr .tcr-pri.park { background:var(--admin-amber-bg); color:var(--pri-park); }
.tcr .tcr-body { font-size:13px; margin-top:8px; color:var(--admin-ink); }
.tcr .tcr-body .k { color:var(--admin-ink-2); font-weight:600; }
.tcr .tcr-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; align-items:center; }
.tcr .tcr-chip { font-size:11px; font-weight:600; color:var(--admin-ink-2); border:1px solid var(--admin-line-soft); border-radius:99px; padding:2px 9px; }
.tcr .tcr-chip.tok { color:var(--admin-accent); border-color:color-mix(in srgb, var(--admin-accent) 15%, transparent); background:color-mix(in srgb, var(--admin-accent) 8%, transparent); }
.tcr .tcr-chip.client { color:var(--admin-ok-strong); border-color:color-mix(in srgb, var(--admin-ok-strong) 25%, transparent); background:color-mix(in srgb, var(--admin-ok-strong) 10%, transparent); }
`;
