"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startShiftAction, endShiftAction } from "@/app/admin/(dashboard)/time/actions";
import { formatDay, dayKey, formatDuration, formatTime, toZonedInput, zoneLabel } from "@/lib/time-log-format";

// The Log Time shift pill, shown top-right on every admin page for admins who
// track time. Off shift it offers "Start shift" (and, once per browser
// session, prompts on arrival); on shift it shows elapsed time and "End". A
// shift open longer than the stale threshold must be closed before anything
// else. Times are entered in the tracker's own timezone.

const PROMPT_DISMISSED_KEY = "teddy-shift-prompt-dismissed";

type Props = {
  timeZone: string;
  open: { startedAt: string } | null;
  stale: boolean;
};

export function ShiftBar({ timeZone, open, stale }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [dialog, setDialog] = useState<"start" | "end" | null>(null);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tick the elapsed time while on shift.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  // Prompt to start on arrival, unless dismissed earlier this browser session.
  useEffect(() => {
    if (open) return;
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(PROMPT_DISMISSED_KEY) === "1";
    } catch {}
    if (!dismissed) openDialog("start");
    // Only on first render for this shift state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function openDialog(kind: "start" | "end") {
    setWhen(toZonedInput(new Date(), timeZone));
    setNote("");
    setError(null);
    setDialog(kind);
  }

  function dismissStart() {
    try {
      window.sessionStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    } catch {}
    setDialog(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = dialog === "start" ? await startShiftAction(when) : await endShiftAction(when, note);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDialog(null);
    router.refresh();
  }

  const forcedEnd = Boolean(open && stale);
  const showEnd = dialog === "end" || forcedEnd;
  const showStart = dialog === "start" && !open;

  return (
    <>
      <div className="admin-shiftbar">
        {open ? (
          <span className="admin-shiftpill is-on">
            <span className="admin-shiftpill-dot" aria-hidden />
            <Link href="/admin/time" className="admin-shiftpill-label">
              On shift · {formatDuration(now - new Date(open.startedAt).getTime())}
            </Link>
            <button type="button" className="admin-btn admin-shiftpill-btn" onClick={() => openDialog("end")}>
              End
            </button>
          </span>
        ) : (
          <button type="button" className="admin-shiftpill" onClick={() => openDialog("start")}>
            <span className="admin-shiftpill-dot" aria-hidden />
            Start shift
          </button>
        )}
      </div>

      {(showStart || showEnd) && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="shift-dialog-title">
          <form className="admin-modal u-stack u-gap-3" onSubmit={submit}>
            {showStart ? (
              <>
                <div className="admin-modal-title" id="shift-dialog-title">
                  Start your shift?
                </div>
                <label className="admin-field">
                  <span className="admin-label">Start time ({zoneLabel(timeZone)})</span>
                  <input
                    className="admin-input"
                    type="datetime-local"
                    required
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <div className="admin-modal-title" id="shift-dialog-title">
                  {forcedEnd ? "⚠ You didn't end your shift" : "End shift"}
                </div>
                {open && (
                  <div className="admin-modal-body u-m-0">
                    {forcedEnd
                      ? `${formatDay(dayKey(open.startedAt, timeZone))}, started ${formatTime(open.startedAt, timeZone)}. Set when it ended before starting a new one.`
                      : `Started ${formatTime(open.startedAt, timeZone)} · ${formatDuration(now - new Date(open.startedAt).getTime())}`}
                  </div>
                )}
                <label className="admin-field">
                  <span className="admin-label">End time ({zoneLabel(timeZone)})</span>
                  <input
                    className="admin-input"
                    type="datetime-local"
                    required
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-label">Note</span>
                  <input
                    className="admin-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
              </>
            )}
            {error && <div className="admin-alert admin-alert--err">{error}</div>}
            <div className="admin-modal-actions u-mt-0">
              {showStart && (
                <button type="button" className="admin-btn" onClick={dismissStart} disabled={saving}>
                  Not now
                </button>
              )}
              {showEnd && !forcedEnd && (
                <button type="button" className="admin-btn" onClick={() => setDialog(null)} disabled={saving}>
                  Cancel
                </button>
              )}
              <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || !when}>
                {saving ? "Saving…" : showStart ? "Start" : forcedEnd ? "Save end time" : "End shift"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
