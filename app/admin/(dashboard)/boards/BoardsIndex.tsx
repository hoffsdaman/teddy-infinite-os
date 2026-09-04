"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/admin/Badge";
import { initials } from "@/lib/boards/types";
import type { BoardListItem } from "@/lib/boards/data";
import { NewBoardForm } from "./NewBoardForm";

const VIEW_KEY = "boards:view";
type View = "cards" | "list";

type SortKey = "name" | "client" | "sprint" | "open" | "done" | "members";

const LIST_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Board" },
  { key: "client", label: "Client" },
  { key: "sprint", label: "Current sprint" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "members", label: "Members" },
];

export function BoardsIndex({
  boards,
  clients,
}: {
  boards: BoardListItem[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  // List on first paint (SSR-safe); the stored preference applies after mount.
  const [view, setView] = useState<View>("list");
  useEffect(() => {
    if (localStorage.getItem(VIEW_KEY) === "cards") setView("cards");
  }, []);
  function pick(v: View) {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((a) => !a);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  }
  // null sortKey = the boards' own sort_order, as the server returned them.
  const sorted = useMemo(() => {
    if (!sortKey) return boards;
    const val = (b: BoardListItem): string | number => {
      switch (sortKey) {
        case "name":
          return b.name.toLowerCase();
        case "client":
          return (b.client_name ?? "").toLowerCase();
        case "sprint":
          return (b.current_sprint?.name ?? "").toLowerCase();
        case "open":
          return b.open_count;
        case "done": {
          const total = b.open_count + b.done_count;
          return total ? b.done_count / total : -1;
        }
        case "members":
          return b.member_names.length;
      }
    };
    return [...boards].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    });
  }, [boards, sortKey, sortAsc]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <button
          className="admin-btn admin-btn--primary admin-btn--sm"
          onClick={() => setCreating(true)}
          disabled={creating}
        >
          New board
        </button>
        <div className="admin-viewtoggle" role="group" aria-label="Boards view">
          <button className={view === "cards" ? "is-active" : ""} onClick={() => pick("cards")}>
            Cards
          </button>
          <button className={view === "list" ? "is-active" : ""} onClick={() => pick("list")}>
            List
          </button>
        </div>
      </div>

      {creating && <NewBoardForm clients={clients} onClose={() => setCreating(false)} />}

      {boards.length === 0 ? (
        <div className="admin-card admin-section-card">
          <span className="admin-cell-muted">No boards yet.</span>
        </div>
      ) : view === "cards" ? (
        <div className="admin-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {boards.map((b) => {
            const total = b.open_count + b.done_count;
            const pct = total > 0 ? Math.round((b.done_count / total) * 100) : 0;
            const shown = b.member_names.slice(0, 4);
            const extra = b.member_names.length - shown.length;
            return (
              <Link
                key={b.id}
                href={`/admin/boards/${b.slug}`}
                className="admin-card admin-section-card is-clickable"
                style={{ display: "flex", flexDirection: "column", gap: 0, textDecoration: "none" }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span className="admin-cell-strong" style={{ fontSize: 15 }}>
                    {b.name}
                  </span>
                  {b.client_name && <Badge tone="info">Client</Badge>}
                </div>
                <div className="admin-cell-muted" style={{ marginTop: 4, minHeight: 18 }}>
                  {b.client_name ?? "Internal"}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div
                    className="admin-cell-muted"
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}
                  >
                    <span>
                      {total === 0 ? "No cards yet" : b.open_count === 0 ? "All done" : `${b.open_count} open`}
                    </span>
                    {total > 0 && <span>{pct}% done</span>}
                  </div>
                  <div className="admin-progress">
                    <div className="admin-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="admin-board-avatar-stack">
                    {shown.map((name, i) => (
                      <span key={`${name}-${i}`} className="admin-kanban-avatar" title={name}>
                        {initials(name)}
                      </span>
                    ))}
                    {extra > 0 && <span className="admin-board-avatar-more">+{extra}</span>}
                    {b.member_names.length === 0 && (
                      <span className="admin-cell-muted" style={{ fontSize: 12 }}>
                        No members
                      </span>
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  {LIST_COLUMNS.map((c) => (
                    <th key={c.key}>
                      <button
                        type="button"
                        className="admin-th-sort"
                        onClick={() => toggleSort(c.key)}
                        aria-label={`Sort by ${c.label}`}
                      >
                        {c.label}
                        <span className="admin-team-dir-caret" aria-hidden>
                          {sortKey === c.key ? (sortAsc ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => {
                  const total = b.open_count + b.done_count;
                  const pct = total > 0 ? Math.round((b.done_count / total) * 100) : 0;
                  const shown = b.member_names.slice(0, 5);
                  const extra = b.member_names.length - shown.length;
                  return (
                    <tr
                      key={b.id}
                      className="is-clickable"
                      tabIndex={0}
                      onClick={() => router.push(`/admin/boards/${b.slug}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") router.push(`/admin/boards/${b.slug}`);
                      }}
                    >
                      <td className="admin-cell-strong">{b.name}</td>
                      <td>
                        {b.client_name ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            {b.client_name} <Badge tone="info">Client</Badge>
                          </span>
                        ) : (
                          <span className="admin-cell-muted">Internal</span>
                        )}
                      </td>
                      <td>
                        {b.current_sprint ? (
                          <Link
                            href={`/admin/boards/${b.slug}/sprints/${b.current_sprint.id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: "var(--admin-accent)", textDecoration: "none", fontWeight: 600 }}
                            title={b.current_sprint.ends_on ? `Ends ${b.current_sprint.ends_on}` : undefined}
                          >
                            {b.current_sprint.name}
                          </Link>
                        ) : (
                          <span className="admin-cell-muted">—</span>
                        )}
                      </td>
                      <td className="admin-cell-mono">{b.open_count}</td>
                      <td>
                        {total === 0 ? (
                          <span className="admin-cell-muted">—</span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span className="admin-progress" style={{ width: 72, display: "inline-block" }}>
                              <span className="admin-progress-fill" style={{ width: `${pct}%`, display: "block" }} />
                            </span>
                            <span className="admin-cell-mono">{pct}%</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="admin-board-avatar-stack">
                          {shown.map((name, i) => (
                            <span key={`${name}-${i}`} className="admin-kanban-avatar" title={name}>
                              {initials(name)}
                            </span>
                          ))}
                          {extra > 0 && <span className="admin-board-avatar-more">+{extra}</span>}
                          {b.member_names.length === 0 && <span className="admin-cell-muted">—</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
