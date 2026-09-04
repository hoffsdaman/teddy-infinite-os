"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KanbanBoard, type KanbanColumn } from "@/components/admin/KanbanBoard";
import { Badge } from "@/components/admin/Badge";
import { DetailDrawer } from "@/components/admin/DetailDrawer";
import { formatDate, timeAgo } from "@/lib/admin/format";
import {
  STAGE_WON,
  STAGE_LEAD,
  STAGE_NEUTRAL,
  STAGE_PROPOSAL,
  STAGE_DISCOVERY,
  STAGE_CONTRACT,
} from "@/lib/admin/stageColors";
import {
  AGING_DAYS,
  NEW_ASSIGNMENT_DAYS,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  TASK_PRIORITIES,
  SUBJECT_COMMITMENT,
  SUBJECT_BACKLOG_ITEM,
  assignedAt,
  daysInColumn,
  initials,
  type TaskPriority,
} from "@/lib/boards/types";
import type { BoardDetail, BoardCard, BoardPerson } from "@/lib/boards/data";
import {
  createCard,
  moveCard,
  updateCard,
  archiveCard,
  createSprint,
  setCardSprint,
  closeSprint,
  setCardRoadmapItem,
  setCardInternal,
  addBoardMember,
  removeBoardMember,
  updateBoard,
  archiveBoard,
  addSubtask,
  toggleSubtask,
  setTaskTokens,
  addComment,
  restoreCard,
} from "./actions";

const NONDONE_ACCENTS = [STAGE_NEUTRAL, STAGE_LEAD, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT];

type Card = BoardCard & { columnId: string };

type Form = {
  id: string | null; // null = create
  columnId: string;
  title: string;
  priority: TaskPriority;
  assigneeId: string;
  dueDate: string;
  humanTokens: string; // "" = not estimated
  description: string;
  sprintId: string; // "" = no sprint
  origSprintId: string;
  subjectType: string | null; // commitment cards are not roadmap-linkable
  subjectLabel: string | null;
  roadmapItemId: string; // "" = none
  origRoadmapItemId: string;
  internal: boolean;
  origInternal: boolean;
};

export function BoardView({
  detail,
  canManage = false,
  teamOptions = [],
  clientOptions = [],
  programOptions = [],
  viewerPersonId = null,
}: {
  detail: BoardDetail;
  canManage?: boolean;
  teamOptions?: BoardPerson[];
  clientOptions?: { id: string; name: string }[];
  // All AI Programs with their owning company; the settings picker shows the
  // ones belonging to the selected client. Empty = picker hidden.
  programOptions?: { id: string; name: string; company_id: string }[];
  viewerPersonId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { board, columns, members, cards: sourceCards, sprints, backlogItems, backlogGroups, archivedCards } = detail;
  const slug = board.slug;
  // This view renders under both /admin/boards and /team/boards; sprint links stay in-section.
  const boardBase = pathname?.startsWith("/team/") ? `/team/boards/${slug}` : `/admin/boards/${slug}`;
  const isClientBoard = board.client_company_id != null;

  const activeSprints = useMemo(() => sprints.filter((s) => s.status === "active"), [sprints]);
  const sprintName = useMemo(() => new Map(sprints.map((s) => [s.id, s.name])), [sprints]);

  const [placement, setPlacement] = useState<Record<string, string>>({});
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState<string>(activeSprints[0]?.id ?? "all");
  const [banner, setBanner] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [sprintsOpen, setSprintsOpen] = useState(false);
  const [sprintForm, setSprintForm] = useState({ name: "", startsOn: "", endsOn: "", goal: "" });
  const [rollTarget, setRollTarget] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardName, setBoardName] = useState(board.name);
  const [boardDescription, setBoardDescription] = useState(board.description ?? "");
  const [boardClientId, setBoardClientId] = useState(board.client_company_id ?? "");
  const [boardProgramId, setBoardProgramId] = useState(board.ai_program_id ?? "");
  const [newMemberId, setNewMemberId] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  // Board page tabs: Stories = the kanban of cards, Sprints = the sprint list
  // with plan-vs-actual counts linking into each sprint's detail page.
  const [tab, setTab] = useState<"stories" | "sprints">("stories");
  const [saving, startSaving] = useTransition();

  function restore(taskId: string) {
    setBanner(null);
    startSaving(async () => {
      const r = await restoreCard(taskId, slug);
      if (!r.ok) return setBanner(r.error);
      router.refresh();
    });
  }

  const activeCard = form?.id ? sourceCards.find((c) => c.id === form.id) ?? null : null;

  function addCmt() {
    if (!form?.id || !newComment.trim()) return;
    setBanner(null);
    startSaving(async () => {
      const r = await addComment(form.id!, newComment, slug);
      if (!r.ok) return setBanner(r.error);
      setNewComment("");
      router.refresh();
    });
  }

  function addSub() {
    if (!form?.id || !newSubtask.trim()) return;
    setBanner(null);
    startSaving(async () => {
      const r = await addSubtask(form.id!, newSubtask, slug);
      if (!r.ok) return setBanner(r.error);
      setNewSubtask("");
      router.refresh();
    });
  }
  function toggleSub(id: string, done: boolean) {
    setBanner(null);
    startSaving(async () => {
      const r = await toggleSubtask(id, done, slug);
      if (!r.ok) return setBanner(r.error);
      router.refresh();
    });
  }
  // Saves a subtask's Human Tokens on blur; "" clears the estimate.
  function saveSubTokens(id: string, raw: string, current: number | null) {
    const next = raw.trim() === "" ? null : Number(raw);
    if (next !== null && !Number.isFinite(next)) return;
    if (next === current) return;
    setBanner(null);
    startSaving(async () => {
      const r = await setTaskTokens(id, next, slug);
      if (!r.ok) return setBanner(r.error);
      router.refresh();
    });
  }

  const memberIds = new Set(members.map((m) => m.id));
  const addableMembers = teamOptions.filter((p) => !memberIds.has(p.id));

  // Programs offerable for the currently selected client; a program from a
  // different company never reaches the save call.
  const clientPrograms = useMemo(
    () => programOptions.filter((p) => boardClientId && p.company_id === boardClientId),
    [programOptions, boardClientId],
  );

  function saveSettings() {
    setBanner(null);
    // Only send the program key when the user actually changed the select, so
    // an unrelated rename never clears an existing program tag, even when the
    // options list failed to load and the current program is not in it.
    const programPatch =
      boardProgramId !== (board.ai_program_id ?? "")
        ? { aiProgramId: boardProgramId || null }
        : {};
    startSaving(async () => {
      const r = await updateBoard(
        board.id,
        {
          name: boardName,
          description: boardDescription,
          clientCompanyId: boardClientId || null,
          ...programPatch,
        },
        slug,
      );
      if (!r.ok) return setBanner(r.error);
      router.refresh();
    });
  }
  function addMember() {
    if (!newMemberId) return;
    setBanner(null);
    startSaving(async () => {
      const r = await addBoardMember(board.id, newMemberId, slug);
      if (!r.ok) return setBanner(r.error);
      setNewMemberId("");
      router.refresh();
    });
  }
  function removeMember(personId: string) {
    setBanner(null);
    startSaving(async () => {
      const r = await removeBoardMember(board.id, personId, slug);
      if (!r.ok) return setBanner(r.error);
      router.refresh();
    });
  }
  function archiveThisBoard() {
    if (!confirm(`Archive board "${board.name}"? It disappears from everyone's boards.`)) return;
    setBanner(null);
    startSaving(async () => {
      const r = await archiveBoard(board.id);
      if (!r.ok) return setBanner(r.error);
      router.push("/admin/boards");
    });
  }

  const firstColumn = columns[0]?.id ?? "";

  const kanbanColumns: KanbanColumn[] = useMemo(() => {
    let nd = 0;
    return columns.map((c) => ({
      id: c.id,
      label: c.name,
      accent: c.is_done ? STAGE_WON : NONDONE_ACCENTS[nd++ % NONDONE_ACCENTS.length],
    }));
  }, [columns]);

  const cards: Card[] = useMemo(() => {
    return sourceCards
      .filter((c) => !assigneeFilter || c.assignee_id === assigneeFilter)
      .filter((c) => !priorityFilter || c.priority === priorityFilter)
      .filter((c) =>
        sprintFilter === "all"
          ? true
          : sprintFilter === "backlog"
            ? c.sprint_id == null
            : c.sprint_id === sprintFilter,
      )
      .map((c) => ({ ...c, columnId: placement[c.id] ?? c.board_column_id ?? firstColumn }));
  }, [sourceCards, assigneeFilter, priorityFilter, sprintFilter, placement, firstColumn]);

  const assigneeOptions = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m.name]));
    for (const c of sourceCards) {
      if (c.assignee_id && c.assignee_name && !map.has(c.assignee_id)) map.set(c.assignee_id, c.assignee_name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [members, sourceCards]);

  function move(cardId: string, toColumnId: string) {
    const prev = placement;
    setPlacement((p) => ({ ...p, [cardId]: toColumnId }));
    setBanner(null);
    moveCard(cardId, toColumnId, slug).then((r) => {
      if (!r.ok) {
        setPlacement(prev);
        setBanner(`Couldn't move card: ${r.error}`);
      } else {
        router.refresh();
      }
    });
  }

  function openCard(c: Card) {
    setForm({
      id: c.id,
      columnId: c.columnId,
      title: c.title,
      priority: c.priority,
      assigneeId: c.assignee_id ?? "",
      dueDate: c.due_date ?? "",
      humanTokens: c.human_tokens == null ? "" : String(c.human_tokens),
      description: c.description ?? "",
      sprintId: c.sprint_id ?? "",
      origSprintId: c.sprint_id ?? "",
      subjectType: c.subject_type,
      subjectLabel: c.subject_label,
      roadmapItemId: c.subject_type === SUBJECT_BACKLOG_ITEM ? c.subject_id ?? "" : "",
      origRoadmapItemId: c.subject_type === SUBJECT_BACKLOG_ITEM ? c.subject_id ?? "" : "",
      internal: c.internal,
      origInternal: c.internal,
    });
  }

  function openCreate(columnId: string) {
    const preset = sprintFilter !== "all" && sprintFilter !== "backlog" ? sprintFilter : "";
    setForm({
      id: null,
      columnId,
      title: "",
      priority: "p3",
      assigneeId: "",
      dueDate: "",
      humanTokens: "",
      description: "",
      sprintId: preset,
      origSprintId: "",
      subjectType: null,
      subjectLabel: null,
      roadmapItemId: "",
      origRoadmapItemId: "",
      internal: false,
      origInternal: false,
    });
  }

  function save() {
    if (!form) return;
    setBanner(null);
    startSaving(async () => {
      let cardId = form.id;
      if (form.id) {
        const r = await updateCard(
          form.id,
          {
            title: form.title,
            description: form.description,
            priority: form.priority,
            assigneeId: form.assigneeId || null,
            dueDate: form.dueDate || null,
            humanTokens: form.humanTokens === "" ? null : Number(form.humanTokens),
          },
          slug,
        );
        if (!r.ok) return setBanner(r.error);
        if (form.sprintId !== form.origSprintId) {
          const sr = await setCardSprint(form.id, form.sprintId || null, slug);
          if (!sr.ok) return setBanner(sr.error);
        }
      } else {
        const r = await createCard({
          boardId: board.id,
          columnId: form.columnId,
          title: form.title,
          priority: form.priority,
          assigneeId: form.assigneeId || undefined,
          dueDate: form.dueDate || undefined,
          humanTokens: form.humanTokens === "" ? undefined : Number(form.humanTokens),
          description: form.description || undefined,
          internal: isClientBoard ? form.internal : undefined,
        });
        if (!r.ok) return setBanner(r.error);
        cardId = r.id ?? null;
        if (form.sprintId && cardId) {
          const sr = await setCardSprint(cardId, form.sprintId, slug);
          if (!sr.ok) return setBanner(sr.error);
        }
      }
      // Roadmap link (client boards, non-commitment cards) if it changed.
      if (isClientBoard && form.subjectType !== SUBJECT_COMMITMENT && cardId && form.roadmapItemId !== form.origRoadmapItemId) {
        const rr = await setCardRoadmapItem(cardId, form.roadmapItemId || null, slug);
        if (!rr.ok) return setBanner(rr.error);
      }
      // Internal flag on existing cards (client boards) if it changed. New cards
      // set it atomically in createCard above, so no client-visible window.
      if (isClientBoard && form.id && form.internal !== form.origInternal) {
        const ir = await setCardInternal(form.id, form.internal, slug);
        if (!ir.ok) return setBanner(ir.error);
      }
      setForm(null);
      router.refresh();
    });
  }

  function archive() {
    if (!form?.id) return;
    setBanner(null);
    startSaving(async () => {
      const r = await archiveCard(form.id!, slug);
      if (!r.ok) return setBanner(r.error);
      setForm(null);
      router.refresh();
    });
  }

  function addSprint() {
    if (!sprintForm.name.trim()) return setBanner("Name the sprint.");
    setBanner(null);
    startSaving(async () => {
      const r = await createSprint(
        board.id,
        {
          name: sprintForm.name,
          startsOn: sprintForm.startsOn || undefined,
          endsOn: sprintForm.endsOn || undefined,
          goal: sprintForm.goal || undefined,
        },
        slug,
      );
      if (!r.ok) return setBanner(r.error);
      setSprintForm({ name: "", startsOn: "", endsOn: "", goal: "" });
      router.refresh();
    });
  }

  function closeOne(sprintId: string) {
    setBanner(null);
    startSaving(async () => {
      const target = rollTarget[sprintId] || null;
      const r = await closeSprint(sprintId, target, slug);
      if (!r.ok) return setBanner(r.error);
      if (sprintFilter === sprintId) setSprintFilter("all");
      router.refresh();
    });
  }

  const columnName = (id: string) => columns.find((c) => c.id === id)?.name ?? "—";

  const filtersActive = assigneeFilter !== "" || priorityFilter !== "" || sprintFilter !== "all";
  function clearFilters() {
    setAssigneeFilter("");
    setPriorityFilter("");
    setSprintFilter("all");
  }

  function isNewForViewer(c: Card): boolean {
    if (!viewerPersonId || c.assignee_id !== viewerPersonId || c.status === "done") return false;
    return Date.now() - new Date(assignedAt(c)).getTime() < NEW_ASSIGNMENT_DAYS * 86400000;
  }

  return (
    <>
      <div className="admin-tabs" role="tablist" style={{ marginBottom: 12 }}>
        <button
          className={`admin-tab${tab === "stories" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "stories"}
          onClick={() => setTab("stories")}
        >
          Stories
        </button>
        <button
          className={`admin-tab${tab === "sprints" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "sprints"}
          onClick={() => setTab("sprints")}
        >
          Sprints{sprints.length > 0 ? ` (${sprints.length})` : ""}
        </button>
      </div>

      {banner && (
        <div className="admin-alert admin-alert--err" style={{ marginBottom: 12 }}>
          {banner}
        </div>
      )}

      {tab === "sprints" && (
        <div style={{ display: "grid", gap: 10 }}>
          {sprints.length === 0 && (
            <div className="admin-cell-muted" style={{ fontSize: 13 }}>
              No sprints yet. Create one with Manage sprints.
            </div>
          )}
          {[...sprints]
            .sort((a, b) => (a.status === b.status ? a.sort_order - b.sort_order : a.status === "active" ? -1 : 1))
            .map((s) => {
              const inSprint = sourceCards.filter((c) => c.sprint_id === s.id);
              const doneCards = inSprint.filter((c) => c.status === "done");
              const totalHT = inSprint.reduce((sum, c) => sum + (c.human_tokens ?? 0), 0);
              const doneHT = doneCards.reduce((sum, c) => sum + (c.human_tokens ?? 0), 0);
              const pct = inSprint.length ? Math.round((doneCards.length / inSprint.length) * 100) : 0;
              return (
                <Link
                  key={s.id}
                  href={`${boardBase}/sprints/${s.id}`}
                  className="admin-card"
                  style={{ padding: "12px 16px", display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="admin-cell-strong">{s.name}</span>
                    <Badge tone={s.status === "active" ? "ok" : "neutral"}>{s.status}</Badge>
                    {(s.starts_on || s.ends_on) && (
                      <span className="admin-cell-muted" style={{ fontSize: 12 }}>
                        {s.starts_on ? formatDate(s.starts_on) : "?"} to {s.ends_on ? formatDate(s.ends_on) : "?"}
                      </span>
                    )}
                    <span className="admin-cell-muted" style={{ marginLeft: "auto", fontSize: 12 }}>
                      {doneCards.length}/{inSprint.length} cards
                      {totalHT > 0 ? ` · ${doneHT}/${totalHT} HT` : ""}
                    </span>
                  </div>
                  {s.goal && (
                    <div className="admin-cell-muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {s.goal}
                    </div>
                  )}
                  <div style={{ marginTop: 8, height: 5, borderRadius: 99, background: "var(--admin-line)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--admin-accent)" }} />
                  </div>
                </Link>
              );
            })}
          <div>
            <button className="admin-btn admin-btn--sm" onClick={() => setSprintsOpen(true)}>
              Manage sprints
            </button>
          </div>
        </div>
      )}

      {tab === "stories" && (
      <>
      <div className="admin-toolbar" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => openCreate(firstColumn)}>
          New card
        </button>
        {sprints.length > 0 && (
          <select
            className={`admin-select${sprintFilter !== "all" ? " is-filtering" : ""}`}
            style={{ maxWidth: 220 }}
            value={sprintFilter}
            onChange={(e) => setSprintFilter(e.target.value)}
            aria-label="Filter by sprint"
          >
            <option value="all">All sprints</option>
            <option value="backlog">Backlog (no sprint)</option>
            {activeSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {sprints
              .filter((s) => s.status === "closed")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (closed)
                </option>
              ))}
          </select>
        )}
        {sprintFilter !== "all" && sprintFilter !== "backlog" && (
          <Link className="admin-btn admin-btn--sm" href={`${boardBase}/sprints/${sprintFilter}`}>
            View sprint
          </Link>
        )}
        <select
          className={`admin-select${assigneeFilter ? " is-filtering" : ""}`}
          style={{ maxWidth: 200 }}
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="">All assignees</option>
          {assigneeOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className={`admin-select${priorityFilter ? " is-filtering" : ""}`}
          style={{ maxWidth: 140 }}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        {filtersActive && (
          <>
            <span className="admin-cell-muted" style={{ fontSize: 12 }}>
              {cards.length} of {sourceCards.length} cards
            </span>
            <button className="admin-btn admin-btn--sm" onClick={clearFilters}>
              ✕ Clear filters
            </button>
          </>
        )}
        {board.program_name && <Badge tone="info">{board.program_name}</Badge>}
        <button className="admin-btn admin-btn--sm" onClick={() => setSprintsOpen(true)}>
          Sprints
        </button>
        {archivedCards.length > 0 && (
          <button className="admin-btn admin-btn--sm" onClick={() => setArchivedOpen(true)}>
            Archived ({archivedCards.length})
          </button>
        )}
        <span
          className="admin-cell-muted"
          style={{ marginLeft: "auto", fontSize: 12, cursor: "help" }}
          title={`Amber clock = in column more than ${AGING_DAYS} days`}
        >
          ◷ &gt;{AGING_DAYS}d
        </span>
        {canManage && (
          <button className="admin-btn admin-btn--sm" onClick={() => setSettingsOpen(true)}>
            ⚙ Board settings
          </button>
        )}
      </div>

      <KanbanBoard<Card>
        columns={kanbanColumns}
        cards={cards}
        onMove={move}
        onCardClick={openCard}
        columnFooter={(col) => (
          <button className="admin-kanban-add" onClick={() => openCreate(col.id)}>
            + Add a card
          </button>
        )}
        cardClassName={(c) => (isNewForViewer(c) ? "is-new" : undefined)}
        renderCard={(c) => {
          const days = daysInColumn(c.last_moved_at);
          const aging = days >= AGING_DAYS && c.status !== "done";
          const overdue =
            c.due_date != null && c.status !== "done" && c.due_date < new Date().toISOString().slice(0, 10);
          return (
            <>
              <div className="admin-kanban-card-title">{c.title}</div>
              <div className="admin-kanban-card-meta">
                {isNewForViewer(c) && <Badge tone="info">New</Badge>}
                <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</Badge>
                {c.subject_type === SUBJECT_COMMITMENT && <Badge tone="ok">Commitment</Badge>}
                {c.subject_type === SUBJECT_BACKLOG_ITEM && <Badge tone="info">Roadmap</Badge>}
                {c.agent && <Badge tone="neutral">Agent</Badge>}
                {c.sprint_id && c.sprint_id !== sprintFilter && sprintName.get(c.sprint_id) && (
                  <Badge tone="info">{sprintName.get(c.sprint_id)}</Badge>
                )}
                {c.internal && <Badge tone="neutral">Internal</Badge>}
              </div>
              <div className="admin-kanban-card-meta">
                {c.assignee_name ? (
                  <span className="admin-kanban-card-assignee">
                    <span className="admin-kanban-avatar">{initials(c.assignee_name)}</span>
                    {c.assignee_name}
                  </span>
                ) : (
                  <span className="admin-kanban-card-sub">Unassigned</span>
                )}
                {c.due_date && (
                  <span
                    className="admin-kanban-card-sub"
                    style={{ marginLeft: "auto", color: overdue ? "var(--admin-err-ink)" : undefined }}
                  >
                    {formatDate(c.due_date)}
                  </span>
                )}
              </div>
              {(c.subtasks.length > 0 || c.comments.length > 0 || c.human_tokens != null) && (
                <div className="admin-kanban-card-sub" style={{ marginTop: 4, display: "flex", gap: 12 }}>
                  {c.subtasks.length > 0 && (
                    <span>
                      ☑ {c.subtasks.filter((s) => s.done).length}/{c.subtasks.length}
                    </span>
                  )}
                  {c.comments.length > 0 && <span>💬 {c.comments.length}</span>}
                  {c.human_tokens != null && <span title="Human Tokens">⚡ {c.human_tokens} HT</span>}
                </div>
              )}
              {aging && (
                <div className="admin-kanban-card-sub" style={{ color: "var(--admin-warn-ink)", marginTop: 4 }}>
                  ◷ {days}d in column
                </div>
              )}
            </>
          );
        }}
      />
      </>
      )}

      <DetailDrawer
        open={form !== null}
        onClose={() => setForm(null)}
        eyebrow={form?.id ? "Card" : "New card"}
        title={form?.id ? form.title || "Card" : "New card"}
      >
        {form && (
          <div className="admin-form">
            <div className="admin-field">
              <label className="admin-label">Title</label>
              <input
                className="admin-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="What needs doing?"
                autoFocus
              />
            </div>

            {form.subjectType === SUBJECT_COMMITMENT && (
              <div
                className="admin-field"
                style={{
                  background: "var(--admin-ok-bg)",
                  color: "var(--admin-ok-ink)",
                  borderRadius: "var(--admin-radius-sm)",
                  padding: "10px 12px",
                }}
              >
                <label className="admin-label" style={{ color: "var(--admin-ok-ink)" }}>
                  Linked commitment
                </label>
                <div>{form.subjectLabel ?? "Coaching commitment"}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Moving this card to a done column marks the commitment kept.
                </div>
              </div>
            )}

            {form.id && (
              <div className="admin-field">
                <label className="admin-label">Column</label>
                {/* A tap path to move a card, so touch users are not forced to drag
                    across a horizontally scrolling board. Drag stays the desktop
                    fast path. */}
                <select
                  className="admin-select"
                  value={placement[form.id] ?? form.columnId}
                  onChange={(e) => move(form.id!, e.target.value)}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="admin-field">
              <label className="admin-label">Priority</label>
              <select
                className="admin-select"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-field">
              <label className="admin-label">Assignee</label>
              <select
                className="admin-select"
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            {activeSprints.length > 0 && (
              <div className="admin-field">
                <label className="admin-label">Sprint</label>
                <select
                  className="admin-select"
                  value={form.sprintId}
                  onChange={(e) => setForm({ ...form, sprintId: e.target.value })}
                >
                  <option value="">No sprint (backlog)</option>
                  {activeSprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isClientBoard && form.subjectType !== SUBJECT_COMMITMENT && (
              <div className="admin-field">
                <label className="admin-label">Roadmap item</label>
                <select
                  className="admin-select"
                  value={form.roadmapItemId}
                  onChange={(e) => setForm({ ...form, roadmapItemId: e.target.value })}
                >
                  <option value="">Not linked</option>
                  {backlogGroups.map((g) => {
                    const items = backlogItems.filter((b) => b.group_key === g.key);
                    if (!items.length) return null;
                    return (
                      <optgroup key={g.key} label={g.label}>
                        {items.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {(() => {
                    // Items whose group is archived or missing still need to be linkable.
                    const known = new Set(backlogGroups.map((g) => g.key));
                    const rest = backlogItems.filter((b) => !b.group_key || !known.has(b.group_key));
                    if (!rest.length) return null;
                    return (
                      <optgroup label="Other">
                        {rest.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })()}
                </select>
              </div>
            )}

            {isClientBoard && (
              <div className="admin-field">
                <label className="admin-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={form.internal}
                    onChange={(e) => setForm({ ...form, internal: e.target.checked })}
                  />
                  Internal (hidden from the client portal)
                </label>
              </div>
            )}

            <div className="admin-field">
              <label className="admin-label">Due date</label>
              <input
                className="admin-input"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>

            <div className="admin-field">
              <label className="admin-label">Human Tokens</label>
              <input
                className="admin-input"
                type="number"
                min={0}
                step={1}
                placeholder="Not estimated"
                value={form.humanTokens}
                onChange={(e) => setForm({ ...form, humanTokens: e.target.value })}
              />
            </div>

            <div className="admin-field">
              <label className="admin-label">Description</label>
              <textarea
                className="admin-textarea"
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {form.id && (
              <div className="admin-field">
                <label className="admin-label">
                  Subtasks
                  {activeCard && activeCard.subtasks.length > 0
                    ? ` (${activeCard.subtasks.filter((s) => s.done).length}/${activeCard.subtasks.length})`
                    : ""}
                </label>
                {activeCard?.subtasks.map((s) => (
                  <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={(e) => toggleSub(s.id, e.target.checked)}
                      disabled={saving}
                    />
                    <span style={{ flex: 1, textDecoration: s.done ? "line-through" : undefined, color: s.done ? "var(--admin-muted)" : undefined }}>
                      {s.title}
                    </span>
                    <input
                      className="admin-input"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="HT"
                      title="Human Tokens"
                      key={`${s.id}-${s.human_tokens ?? ""}`}
                      defaultValue={s.human_tokens ?? ""}
                      onBlur={(e) => saveSubTokens(s.id, e.target.value, s.human_tokens)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      disabled={saving}
                      style={{ width: 64, flex: "none" }}
                    />
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input
                    className="admin-input"
                    placeholder="Add a subtask…"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSub();
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <button className="admin-btn" onClick={addSub} disabled={saving || !newSubtask.trim()}>
                    Add
                  </button>
                </div>
              </div>
            )}

            {form.id && (
              <div className="admin-field">
                <label className="admin-label">
                  Comments{activeCard && activeCard.comments.length > 0 ? ` (${activeCard.comments.length})` : ""}
                </label>
                {activeCard?.comments.map((c) => (
                  <div key={c.id} style={{ padding: "8px 0", borderTop: "1px solid var(--admin-line)" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span className="admin-cell-strong" style={{ fontSize: 12 }}>
                        {c.author}
                      </span>
                      <span className="admin-cell-muted" style={{ fontSize: 11 }}>
                        {timeAgo(c.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 2 }}>{c.body}</div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <textarea
                    className="admin-textarea"
                    rows={2}
                    placeholder="Add a comment…"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="admin-btn"
                    onClick={addCmt}
                    disabled={saving || !newComment.trim()}
                    style={{ alignSelf: "flex-end" }}
                  >
                    Comment
                  </button>
                </div>
              </div>
            )}

            <div className="admin-form-actions" style={{ display: "flex", gap: 8 }}>
              <button className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save" : "Create card"}
              </button>
              {form.id && (
                <button className="admin-btn admin-btn--danger" onClick={archive} disabled={saving}>
                  Archive
                </button>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      <DetailDrawer open={sprintsOpen} onClose={() => setSprintsOpen(false)} eyebrow="Board" title="Sprints">
        <div className="admin-form">
          <div className="admin-field">
            <label className="admin-label">New sprint</label>
            <input
              className="admin-input"
              placeholder="Name (e.g. Aug 18-29)"
              value={sprintForm.name}
              onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })}
            />
          </div>
          <div className="admin-field" style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="admin-label">Starts</label>
              <input
                className="admin-input"
                type="date"
                value={sprintForm.startsOn}
                onChange={(e) => setSprintForm({ ...sprintForm, startsOn: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="admin-label">Ends</label>
              <input
                className="admin-input"
                type="date"
                value={sprintForm.endsOn}
                onChange={(e) => setSprintForm({ ...sprintForm, endsOn: e.target.value })}
              />
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label">Goal (optional)</label>
            <input
              className="admin-input"
              value={sprintForm.goal}
              onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })}
            />
          </div>
          <div className="admin-form-actions">
            <button className="admin-btn admin-btn--primary" onClick={addSprint} disabled={saving}>
              Add sprint
            </button>
          </div>

          {sprints.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label className="admin-label">Existing</label>
              {sprints.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 0",
                    borderTop: "1px solid var(--admin-line)",
                    flexWrap: "wrap",
                  }}
                >
                  <Link className="admin-cell-strong" href={`${boardBase}/sprints/${s.id}`}>
                    {s.name}
                  </Link>
                  <Badge tone={s.status === "active" ? "ok" : "neutral"}>{s.status}</Badge>
                  {s.status === "active" && (
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      <select
                        className="admin-select"
                        value={rollTarget[s.id] ?? ""}
                        onChange={(e) => setRollTarget({ ...rollTarget, [s.id]: e.target.value })}
                        aria-label="Roll unfinished to"
                        style={{ maxWidth: 160 }}
                      >
                        <option value="">Roll to backlog</option>
                        {activeSprints
                          .filter((o) => o.id !== s.id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              Roll to {o.name}
                            </option>
                          ))}
                      </select>
                      <button className="admin-btn admin-btn--sm" onClick={() => closeOne(s.id)} disabled={saving}>
                        Close
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DetailDrawer>

      <DetailDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} eyebrow="Board" title="Board settings">
        <div className="admin-form">
          <div className="admin-field">
            <label className="admin-label">Name</label>
            <input className="admin-input" value={boardName} onChange={(e) => setBoardName(e.target.value)} />
          </div>
          <div className="admin-field">
            <label className="admin-label">Description</label>
            <textarea
              className="admin-textarea"
              rows={2}
              value={boardDescription}
              onChange={(e) => setBoardDescription(e.target.value)}
              placeholder="What this board is for"
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">Client</label>
            <select
              className="admin-select"
              value={boardClientId}
              onChange={(e) => setBoardClientId(e.target.value)}
            >
              <option value="">No client (internal board)</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="admin-hint">A client board is read-only in that client&apos;s portal.</p>
          </div>
          {boardClientId && clientPrograms.length > 0 && (
            <div className="admin-field">
              <label className="admin-label">AI Program</label>
              <select
                className="admin-select"
                value={clientPrograms.some((p) => p.id === boardProgramId) ? boardProgramId : ""}
                onChange={(e) => setBoardProgramId(e.target.value)}
              >
                <option value="">Company-wide</option>
                {clientPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="admin-hint">Optional: key this board to one of the client&apos;s AI Programs.</p>
            </div>
          )}
          <div className="admin-form-actions">
            <button className="admin-btn admin-btn--primary" onClick={saveSettings} disabled={saving}>
              Save
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <label className="admin-label">Members ({members.length})</label>
            {members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 0",
                  borderTop: "1px solid var(--admin-line)",
                }}
              >
                <span className="admin-cell-strong" style={{ flex: 1 }}>
                  {m.name}
                </span>
                <button className="admin-btn admin-btn--sm" onClick={() => removeMember(m.id)} disabled={saving}>
                  Remove
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <select
                className="admin-select"
                value={newMemberId}
                onChange={(e) => setNewMemberId(e.target.value)}
                aria-label="Add member"
                style={{ flex: 1 }}
              >
                <option value="">Add a member…</option>
                {addableMembers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="admin-btn" onClick={addMember} disabled={saving || !newMemberId}>
                Add
              </button>
            </div>
          </div>

          <div style={{ marginTop: 18, borderTop: "1px solid var(--admin-line)", paddingTop: 12 }}>
            <button className="admin-btn admin-btn--danger" onClick={archiveThisBoard} disabled={saving}>
              Archive board
            </button>
          </div>
        </div>
      </DetailDrawer>

      <DetailDrawer open={archivedOpen} onClose={() => setArchivedOpen(false)} eyebrow="Board" title="Archived cards">
        <div className="admin-form">
          {archivedCards.length === 0 ? (
            <span className="admin-cell-muted">Nothing archived.</span>
          ) : (
            archivedCards.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 0",
                  borderTop: "1px solid var(--admin-line)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="admin-cell-strong">{a.title}</div>
                  <div className="admin-cell-muted" style={{ fontSize: 11 }}>
                    {a.columnName ? `${a.columnName} · ` : ""}archived {timeAgo(a.archivedAt)}
                    {a.archivedBy ? ` by ${a.archivedBy}` : ""}
                  </div>
                </div>
                <button className="admin-btn admin-btn--sm" onClick={() => restore(a.id)} disabled={saving}>
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      </DetailDrawer>
    </>
  );
}
