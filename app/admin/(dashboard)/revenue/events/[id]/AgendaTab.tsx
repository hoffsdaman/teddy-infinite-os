"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  groupAgendaByDay,
  AGENDA_PERIODS,
  AGENDA_STAFF_ROLES,
  PERIOD_LABELS,
  STAFF_ROLE_LABELS,
  type AgendaBlock,
  type AgendaPeriod,
  type AgendaStaffRole,
} from "@/lib/admin/event-agenda-shared";
import { PersonSelect } from "@/components/admin/PersonSelect";
import {
  createAgendaBlock,
  editAgendaBlock,
  removeAgendaBlockAction,
  reorderAgendaBlock,
  assignAgendaStaff,
  unassignAgendaStaff,
  cloneAgenda,
} from "./agenda-actions";

type PeopleOption = { id: string; name: string };
type CloneSource = { id: string; title: string };
type Result = { ok: true } | { ok: false; error: string };

type BlockForm = {
  id: string | null;
  dayIndex: string;
  dayLabel: string;
  dayDate: string;
  period: "" | AgendaPeriod;
  timeLabel: string;
  title: string;
  body: string;
  room: string;
  guestVisible: boolean;
};

const emptyForm = (dayIndex = 1): BlockForm => ({
  id: null,
  dayIndex: String(dayIndex),
  dayLabel: "",
  dayDate: "",
  period: "",
  timeLabel: "",
  title: "",
  body: "",
  room: "",
  guestVisible: true,
});

export function AgendaTab({
  eventId,
  blocks,
  people,
  cloneSources,
}: {
  eventId: string;
  blocks: AgendaBlock[];
  people: PeopleOption[];
  cloneSources: CloneSource[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<BlockForm | null>(null);

  const days = groupAgendaByDay(blocks, "ops");

  function run(fn: () => Promise<Result>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  function submitForm() {
    if (!form) return;
    const input = {
      dayIndex: Number(form.dayIndex) || 1,
      dayLabel: form.dayLabel || null,
      dayDate: form.dayDate || null,
      period: form.period || null,
      timeLabel: form.timeLabel || null,
      title: form.title,
      body: form.body || null,
      room: form.room || null,
      guestVisible: form.guestVisible,
    };
    if (!input.title.trim()) {
      setError("Block title is required.");
      return;
    }
    const action = form.id
      ? () => editAgendaBlock(eventId, form.id!, input)
      : () => createAgendaBlock(eventId, input);
    run(action, () => setForm(null));
  }

  function openEdit(b: AgendaBlock) {
    setError(null);
    setForm({
      id: b.id,
      dayIndex: String(b.dayIndex),
      dayLabel: b.dayLabel ?? "",
      dayDate: b.dayDate ?? "",
      period: b.period ?? "",
      timeLabel: b.timeLabel ?? "",
      title: b.title,
      body: b.body ?? "",
      room: b.room ?? "",
      guestVisible: b.guestVisible,
    });
  }

  const nextDayIndex = days.length ? Math.max(...days.map((d) => d.dayIndex)) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="admin-btn admin-btn--primary" onClick={() => setForm(emptyForm(nextDayIndex))} disabled={pending}>
          + Add block
        </button>
        {cloneSources.length > 0 && <CloneBar eventId={eventId} sources={cloneSources} run={run} disabled={pending} />}
      </div>

      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}

      {form && (
        <BlockFormCard
          form={form}
          setForm={setForm}
          onSubmit={submitForm}
          onCancel={() => setForm(null)}
          disabled={pending}
        />
      )}

      {days.length === 0 && !form ? (
        <div className="admin-empty">No agenda blocks yet. Add the first block, or clone from another retreat.</div>
      ) : (
        days.map((day) => (
          <section key={day.dayIndex} style={{ border: "1px solid var(--admin-line)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {day.dayLabel || `Day ${day.dayIndex}`}
              {day.dayDate ? <span style={{ opacity: 0.6, fontWeight: 400 }}> · {day.dayDate}</span> : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {day.blocks.map((b, i) => (
                <BlockCard
                  key={b.id}
                  block={b}
                  people={people}
                  disabled={pending}
                  isFirst={i === 0}
                  isLast={i === day.blocks.length - 1}
                  onEdit={() => openEdit(b)}
                  onDelete={() => run(() => removeAgendaBlockAction(eventId, b.id))}
                  onMove={(dir) => run(() => reorderAgendaBlock(eventId, b.id, dir))}
                  onAddStaff={(personId, role) => run(() => assignAgendaStaff(eventId, b.id, personId, role))}
                  onRemoveStaff={(staffId) => run(() => unassignAgendaStaff(eventId, staffId))}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function CloneBar({
  eventId,
  sources,
  run,
  disabled,
}: {
  eventId: string;
  sources: CloneSource[];
  run: (fn: () => Promise<Result>) => void;
  disabled: boolean;
}) {
  const [sourceId, setSourceId] = useState("");
  const [includeStaff, setIncludeStaff] = useState(true);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select className="admin-select" value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={disabled}>
        <option value="">Clone agenda from…</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <label style={{ fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}>
        <input type="checkbox" checked={includeStaff} onChange={(e) => setIncludeStaff(e.target.checked)} disabled={disabled} />
        with staff
      </label>
      <button
        className="admin-btn"
        disabled={disabled || !sourceId}
        onClick={() => run(() => cloneAgenda(eventId, sourceId, includeStaff))}
      >
        Clone
      </button>
    </div>
  );
}

function BlockFormCard({
  form,
  setForm,
  onSubmit,
  onCancel,
  disabled,
}: {
  form: BlockForm;
  setForm: (f: BlockForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const set = (patch: Partial<BlockForm>) => setForm({ ...form, ...patch });
  return (
    <div style={{ border: "1px solid var(--admin-line)", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 600 }}>{form.id ? "Edit block" : "New block"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Day #">
          <input className="admin-input" type="number" min={1} value={form.dayIndex} onChange={(e) => set({ dayIndex: e.target.value })} />
        </Field>
        <Field label="Day label">
          <input className="admin-input" value={form.dayLabel} placeholder="Day 1: Arrive & begin" onChange={(e) => set({ dayLabel: e.target.value })} />
        </Field>
        <Field label="Day date">
          <input className="admin-input" type="date" value={form.dayDate} onChange={(e) => set({ dayDate: e.target.value })} />
        </Field>
        <Field label="Period">
          <select className="admin-select" value={form.period} onChange={(e) => set({ period: e.target.value as BlockForm["period"] })}>
            <option value="">None</option>
            {AGENDA_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Time label">
          <input className="admin-input" value={form.timeLabel} placeholder="09:00–10:30" onChange={(e) => set({ timeLabel: e.target.value })} />
        </Field>
        <Field label="Room">
          <input className="admin-input" value={form.room} onChange={(e) => set({ room: e.target.value })} />
        </Field>
      </div>
      <Field label="Title">
        <input className="admin-input" value={form.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Body">
        <textarea className="admin-input" rows={3} value={form.body} onChange={(e) => set({ body: e.target.value })} />
      </Field>
      <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={form.guestVisible} onChange={(e) => set({ guestVisible: e.target.checked })} />
        Show to guest (uncheck for ops-only / work-schedule blocks)
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="admin-btn admin-btn-primary" onClick={onSubmit} disabled={disabled}>
          {form.id ? "Save" : "Add block"}
        </button>
        <button className="admin-btn" onClick={onCancel} disabled={disabled}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function BlockCard({
  block,
  people,
  disabled,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMove,
  onAddStaff,
  onRemoveStaff,
}: {
  block: AgendaBlock;
  people: PeopleOption[];
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  onAddStaff: (personId: string, role: AgendaStaffRole) => void;
  onRemoveStaff: (staffId: string) => void;
}) {
  const time = block.timeLabel || (block.period ? PERIOD_LABELS[block.period] : "");
  return (
    <div style={{ border: "1px solid var(--admin-line)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            {time}
            {block.room ? ` · ${block.room}` : ""}
            {!block.guestVisible ? " · ops only" : ""}
          </div>
          <div style={{ fontWeight: 600 }}>{block.title}</div>
          {block.body && <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>{block.body}</div>}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button className="admin-btn" onClick={() => onMove("up")} disabled={disabled || isFirst} title="Move up">
            ↑
          </button>
          <button className="admin-btn" onClick={() => onMove("down")} disabled={disabled || isLast} title="Move down">
            ↓
          </button>
          <button className="admin-btn" onClick={onEdit} disabled={disabled}>
            Edit
          </button>
          <button className="admin-btn" onClick={onDelete} disabled={disabled} title="Delete block">
            ✕
          </button>
        </div>
      </div>

      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {block.staff.map((s) => (
          <span
            key={s.id}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--admin-tint)",
              display: "inline-flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            {s.personName ?? "Unknown"} · {STAFF_ROLE_LABELS[s.role]}
            <button
              onClick={() => onRemoveStaff(s.id)}
              disabled={disabled}
              style={{ border: "none", background: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
              title="Remove"
            >
              ✕
            </button>
          </span>
        ))}
        <StaffAdder people={people} disabled={disabled} onAdd={onAddStaff} />
      </div>
    </div>
  );
}

function StaffAdder({
  people,
  disabled,
  onAdd,
}: {
  people: PeopleOption[];
  disabled: boolean;
  onAdd: (personId: string, role: AgendaStaffRole) => void;
}) {
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<AgendaStaffRole>("engineer");
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <PersonSelect
        compact
        value={personId}
        onChange={setPersonId}
        disabled={disabled}
        emptyLabel="+ staff…"
        options={people.map((p) => ({ value: p.id, label: p.name }))}
        style={{ minWidth: 120 }}
      />
      <select className="admin-select" value={role} onChange={(e) => setRole(e.target.value as AgendaStaffRole)} disabled={disabled} style={{ fontSize: 12 }}>
        {AGENDA_STAFF_ROLES.map((r) => (
          <option key={r} value={r}>
            {STAFF_ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        className="admin-btn"
        disabled={disabled || !personId}
        onClick={() => {
          if (!personId) return;
          onAdd(personId, role);
          setPersonId("");
        }}
      >
        Add
      </button>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      {children}
    </label>
  );
}
