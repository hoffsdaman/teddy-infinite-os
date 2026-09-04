"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientDocument } from "@/lib/portal/documents";
import {
  signedDocumentUploadAction,
  recordCompanyDocumentAction,
  downloadCompanyDocumentAction,
  deleteOwnDocumentAction,
} from "./actions";

// Company Documents: list + direct-to-storage upload + delete-own. Downloads
// open via short-lived signed URLs minted server-side (private bucket). Delete
// is uploader-only; the server re-checks, the UI simply hides the button for
// files someone else uploaded.

const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type CompanyOption = { companyId: string; companyName: string };

type QueueItem = {
  id: number;
  file: File;
  progress: number; // 0..1
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// PUT the file straight to Supabase Storage via the one-shot signed URL, so the
// bytes never pass through the serverless function (Vercel caps bodies ~4.5MB).
function putToSignedUrl(signedUrl: string, file: File, onProgress: (p: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    if (SUPABASE_KEY) xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 0.95);
    };
    xhr.onload = () =>
      resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, error: `Upload failed (${xhr.status}).` });
    xhr.onerror = () => resolve({ ok: false, error: "Network error." });
    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", file);
    xhr.send(fd);
  });
}

export function DocumentsView({
  documents,
  companies,
  actorEmail,
}: {
  documents: ClientDocument[];
  companies: CompanyOption[];
  actorEmail: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [companyId, setCompanyId] = useState(companies[0]?.companyId ?? "");
  const [drag, setDrag] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myEmail = actorEmail.toLowerCase();

  function update(id: number, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  // Files start uploading the moment they land — no separate submit step.
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    const items = files.map((file) => ({ id: nextId.current++, file, progress: 0, status: "queued" as const }));
    setQueue((q) => [...items, ...q]);
    for (const it of items) {
      update(it.id, { status: "uploading", progress: 0 });
      const signed = await signedDocumentUploadAction({ companyId: companyId || undefined, filename: it.file.name });
      if (!signed.ok) {
        update(it.id, { status: "error", error: signed.error });
        continue;
      }
      const put = await putToSignedUrl(signed.signedUrl, it.file, (p) => update(it.id, { progress: p }));
      if (!put.ok) {
        update(it.id, { status: "error", error: put.error });
        continue;
      }
      const rec = await recordCompanyDocumentAction({
        companyId: signed.companyId,
        path: signed.path,
        filename: it.file.name,
        sizeBytes: it.file.size,
      });
      update(it.id, rec.ok ? { status: "done", progress: 1 } : { status: "error", error: rec.error });
    }
    setQueue((q) => q.filter((it) => it.status !== "done"));
    router.refresh();
  }

  async function download(id: string) {
    setError(null);
    setBusyId(id);
    const r = await downloadCompanyDocumentAction(id);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function remove(doc: ClientDocument) {
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    setError(null);
    setBusyId(doc.id);
    const r = await deleteOwnDocumentAction(doc.id);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  const canUpload = companies.length > 0;

  return (
    <div>
      {canUpload && (
      <div className="admin-card admin-section-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-card-title" style={{ marginBottom: 10 }}>Upload documents</h2>
        {companies.length > 1 && (
          <div style={{ marginBottom: 12, maxWidth: 360 }}>
            <label className="admin-label" htmlFor="doc-company">Company</label>
            <select
              id="doc-company"
              className="admin-select"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.companyId} value={c.companyId}>{c.companyName}</option>
              ))}
            </select>
          </div>
        )}
        <div
          className={`admin-gallery-drop${drag ? " is-drag" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <span className="admin-gallery-drop-ico" aria-hidden>⬆</span>
          <span className="admin-gallery-drop-title">Drag files here, or click to browse</span>
          <span className="admin-gallery-drop-sub">PDF, Word, slides, spreadsheets, text · up to 25 MB each</span>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); if (inputRef.current) inputRef.current.value = ""; }} />
        </div>

        {queue.length > 0 && (
          <div className="admin-list" style={{ marginTop: 12 }}>
            {queue.map((it) => (
              <div className="admin-list-row" key={it.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{it.file.name}</div>
                  <div className="admin-list-sub">
                    {it.status === "error" ? (
                      <span style={{ color: "var(--admin-err-ink)" }}>{it.error}</span>
                    ) : it.status === "uploading" ? (
                      `Uploading… ${Math.round(it.progress * 100)}%`
                    ) : (
                      formatBytes(it.file.size)
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title" style={{ marginBottom: 10 }}>All documents</h2>
        {documents.length === 0 ? (
          <div className="admin-empty">{canUpload ? "No documents yet. Upload the first one above." : "No documents yet."}</div>
        ) : (
          <div className="admin-list">
            {documents.map((d) => (
              <div className="admin-list-row" key={d.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{d.filename}</div>
                  <div className="admin-list-sub">
                    {formatDay(d.createdAt)}
                    {(d.uploaderName || d.uploadedBy) && ` · uploaded by ${d.uploaderName ?? d.uploadedBy}`}
                    {d.sizeBytes != null && ` · ${formatBytes(d.sizeBytes)}`}
                    {d.programId && d.programName && (
                      <>
                        {" · "}
                        <Link href={`/portal/programs/${d.programId}`}>{d.programName}</Link>
                      </>
                    )}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <button
                    type="button"
                    className="admin-btn admin-btn--sm"
                    onClick={() => download(d.id)}
                    disabled={busyId === d.id}
                  >
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
        )}
        {error && <div className="admin-alert admin-alert--err" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}
