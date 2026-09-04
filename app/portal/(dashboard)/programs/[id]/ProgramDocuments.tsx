"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadDocumentAction } from "../actions";
import { deleteOwnDocumentAction } from "../../documents/actions";
import type { PortalProgramDocument } from "@/lib/portal/ai-programs";

function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Documents open via a short-lived signed URL minted server-side (private
// bucket), so links can't be shared or guessed. Delete is uploader-only: the
// button renders only for your own uploads and the server re-checks anyway.
export function ProgramDocuments({
  documents,
  actorEmail,
}: {
  documents: PortalProgramDocument[];
  actorEmail: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myEmail = actorEmail.toLowerCase();

  async function open(id: string) {
    setError(null);
    setBusyId(id);
    const r = await downloadDocumentAction(id);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function remove(d: PortalProgramDocument) {
    if (!window.confirm(`Delete "${d.filename}"? This cannot be undone.`)) return;
    setError(null);
    setBusyId(d.id);
    const r = await deleteOwnDocumentAction(d.id);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="admin-list">
        {documents.map((d) => (
          <div className="admin-list-row" key={d.id}>
            <div className="admin-list-main">
              <div className="admin-list-title">{d.filename}</div>
              {d.sizeBytes != null && <div className="admin-list-sub">{formatBytes(d.sizeBytes)}</div>}
            </div>
            <div className="admin-list-aside">
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => open(d.id)} disabled={busyId === d.id}>
                {busyId === d.id ? "…" : "Download"}
              </button>
              {(d.uploadedBy ?? "").toLowerCase() === myEmail && (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--danger"
                  onClick={() => remove(d)}
                  disabled={busyId === d.id}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}
    </div>
  );
}
