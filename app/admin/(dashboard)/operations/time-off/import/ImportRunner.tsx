"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ImportReport } from "@/lib/dayoff/import";
import { runImport } from "./actions";

export function ImportRunner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  function run() {
    if (!window.confirm("Run the Day Off import now? Reads everything from Day Off and writes snapshots, policies, requests, and balance anchors. Idempotent — safe to re-run.")) return;
    setError(null);
    start(async () => {
      const res = await runImport();
      if (res.ok) {
        setReport(res.report);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="admin-timeoff">
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}

      <button className="admin-btn admin-btn--primary" onClick={run} disabled={pending}>
        {pending ? "Importing… (takes a minute or two)" : "Run Day Off import"}
      </button>

      {report && (
        <div className="admin-card u-mt-5 u-p-4">
          <h2 className="admin-card-title">Import report — anchor {report.anchorDate}</h2>
          <ul className="admin-import-summary">
            <li><strong>{report.employees.matched.length + report.employees.created.length}</strong> of {report.employees.total} Day Off employees imported ({report.employees.matched.length} matched, {report.employees.created.length} newly created, {report.employees.skippedCustomer.length} customer accounts skipped)</li>
            <li><strong>{report.requests.imported}</strong> leave requests imported ({report.requests.compOffCredits} comp-off credits routed to adjustments, {report.requests.markedRemoved} tombstoned)</li>
            <li><strong>{report.balances.adjustmentsWritten}</strong> balance-anchor adjustments written</li>
            <li><strong>{report.policies.length}</strong> policies imported: {report.policies.map((p) => `${p.name} (${p.ruleCount} rules${p.isDefault ? ", default" : ""})`).join(", ")}</li>
            <li>{report.snapshots} raw snapshots captured; {report.warnings.length} warnings</li>
          </ul>

          {report.employees.created.length > 0 && (
            <>
              <h3 className="admin-card-title u-mt-4">New records created (had no CRM presence)</h3>
              <ul>{report.employees.created.map((u) => (
                <li key={u.dayoffId}>
                  {u.name} — {u.email} ({u.status})
                  {u.flaggedEntity && <strong className="u-warn"> ⚑ review legal entity</strong>}
                </li>
              ))}</ul>
            </>
          )}
          {report.employees.unmatchedDayoff.length > 0 && (
            <>
              <h3 className="admin-card-title u-mt-4">Unmatched Day Off employees (snapshot only)</h3>
              <ul>{report.employees.unmatchedDayoff.map((u) => <li key={u.dayoffId}>{u.name} — {u.email ?? "no email"}</li>)}</ul>
            </>
          )}
          {report.employees.unmatchedLocal.length > 0 && (
            <>
              <h3 className="admin-card-title u-mt-4">Team members with no Day Off account</h3>
              <ul>{report.employees.unmatchedLocal.map((u) => <li key={u.teamMemberId}>{u.name} — {u.email}</li>)}</ul>
            </>
          )}
          {report.warnings.length > 0 && (
            <>
              <h3 className="admin-card-title u-mt-4">Warnings</h3>
              <ul>{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </>
          )}

          <details className="u-mt-4">
            <summary>Full report JSON</summary>
            <pre className="admin-import-json">{JSON.stringify(report, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
