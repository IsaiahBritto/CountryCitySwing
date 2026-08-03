"use client";

import { useEffect, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutline, compBtnSecondary, compBtnTabActive } from "@/lib/comps/buttonStyles";

interface EntryRow {
  id: string;
  entry_kind: "individual" | "couple";
  role: "lead" | "follow" | null;
  lead_first_name: string;
  lead_last_name: string;
  lead_email: string | null;
  follow_first_name: string;
  follow_last_name: string;
  follow_email: string | null;
  lead_bib: { bib_number: number } | null;
  follow_bib: { bib_number: number } | null;
  source_lead_entry_id: string | null;
  comp_signup_id: string | null;
}

interface ImportRow {
  signupId: string;
  leadName: string;
  leadEmail: string | null;
  followName: string;
  followEmail: string | null;
  warnings: string[];
  alreadyImported: boolean;
}

export default function EntriesTab({
  competitionId,
  compType,
  entries,
  onChanged,
}: {
  competitionId: string;
  compType: "jack_and_jill" | "strictly";
  entries: EntryRow[];
  onChanged: () => void;
}) {
  const isJnJ = compType === "jack_and_jill";
  const [error, setError] = useState<string | null>(null);

  // Import flow
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // Walk-up form
  const [walkupOpen, setWalkupOpen] = useState(false);
  const [wuRole, setWuRole] = useState<"lead" | "follow">("lead");
  const [wuLeadFirst, setWuLeadFirst] = useState("");
  const [wuLeadLast, setWuLeadLast] = useState("");
  const [wuLeadEmail, setWuLeadEmail] = useState("");
  const [wuFollowFirst, setWuFollowFirst] = useState("");
  const [wuFollowLast, setWuFollowLast] = useState("");
  const [wuFollowEmail, setWuFollowEmail] = useState("");
  const [addingWalkup, setAddingWalkup] = useState(false);

  useEffect(() => {
    if (!importOpen) return;
    (async () => {
      setImportRows(null);
      const res = await authedFetch(`/api/admin/comps/${competitionId}/import`);
      if (!res.ok) {
        setError(await apiError(res));
        return;
      }
      const data = await res.json();
      const rows: ImportRow[] = data.rows ?? [];
      setImportRows(rows);
      // Preselect clean, not-yet-imported rows.
      setSelected(
        new Set(
          rows
            .filter((r) => !r.alreadyImported && r.warnings.length === 0)
            .map((r) => r.signupId)
        )
      );
    })();
  }, [importOpen, competitionId]);

  const runImport = async () => {
    setImporting(true);
    setError(null);
    const res = await authedFetch(`/api/admin/comps/${competitionId}/import`, {
      method: "POST",
      body: JSON.stringify({ signup_ids: [...selected] }),
    });
    setImporting(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setImportOpen(false);
    onChanged();
  };

  const addWalkup = async () => {
    setAddingWalkup(true);
    setError(null);
    const body: Record<string, unknown> = isJnJ
      ? {
          entry_kind: "individual",
          role: wuRole,
          ...(wuRole === "lead"
            ? {
                lead_first_name: wuLeadFirst,
                lead_last_name: wuLeadLast,
                lead_email: wuLeadEmail,
              }
            : {
                follow_first_name: wuFollowFirst,
                follow_last_name: wuFollowLast,
                follow_email: wuFollowEmail,
              }),
        }
      : {
          entry_kind: "couple",
          lead_first_name: wuLeadFirst,
          lead_last_name: wuLeadLast,
          lead_email: wuLeadEmail,
          follow_first_name: wuFollowFirst,
          follow_last_name: wuFollowLast,
          follow_email: wuFollowEmail,
        };
    const res = await authedFetch(`/api/admin/comps/${competitionId}/entries`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setAddingWalkup(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setWalkupOpen(false);
    setWuLeadFirst("");
    setWuLeadLast("");
    setWuLeadEmail("");
    setWuFollowFirst("");
    setWuFollowLast("");
    setWuFollowEmail("");
    onChanged();
  };

  const removeEntry = async (entryId: string) => {
    if (!confirm("Remove this entry?")) return;
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/entries?entry_id=${entryId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    onChanged();
  };

  const baseEntries = entries.filter((e) => !e.source_lead_entry_id);
  const drawnCouples = entries.filter((e) => e.source_lead_entry_id);

  const entryName = (e: EntryRow) => {
    if (e.entry_kind === "couple") {
      return `${e.lead_first_name} ${e.lead_last_name} & ${e.follow_first_name} ${e.follow_last_name}`.trim();
    }
    return e.role === "follow"
      ? `${e.follow_first_name} ${e.follow_last_name}`.trim()
      : `${e.lead_first_name} ${e.lead_last_name}`.trim();
  };
  const entryBib = (e: EntryRow) =>
    e.entry_kind === "couple" || e.role === "lead"
      ? e.lead_bib?.bib_number
      : e.follow_bib?.bib_number;

  const inputCls =
    "rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white";

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setImportOpen(true)} className={compBtnOutline}>
          Import from signups
        </button>
        <button
          onClick={() => setWalkupOpen((v) => !v)}
          className="rounded-md border border-neutral-600 px-4 py-2 text-sm text-neutral-200 hover:border-primary/60"
        >
          Add walk-up
        </button>
      </div>

      {walkupOpen && (
        <div className="mb-4 rounded-xl border border-neutral-700 bg-neutral-800/60 p-4">
          <h3 className="mb-3 font-semibold text-white">
            Walk-up {isJnJ ? "competitor" : "couple"}
          </h3>
          {isJnJ && (
            <div className="mb-3 flex gap-2">
              {(["lead", "follow"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setWuRole(r)}
                  className={
                    "rounded-md px-3 py-1.5 text-sm min-h-11 " +
                    (wuRole === r ? compBtnTabActive : compBtnSecondary)
                  }
                >
                  {r === "lead" ? "Lead" : "Follow"}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3">
            {(!isJnJ || wuRole === "lead") && (
              <>
                <input className={inputCls} placeholder="Lead first name" value={wuLeadFirst} onChange={(e) => setWuLeadFirst(e.target.value)} />
                <input className={inputCls} placeholder="Lead last name" value={wuLeadLast} onChange={(e) => setWuLeadLast(e.target.value)} />
                <input className={inputCls} placeholder="Lead email (optional)" value={wuLeadEmail} onChange={(e) => setWuLeadEmail(e.target.value)} />
              </>
            )}
            {(!isJnJ || wuRole === "follow") && (
              <>
                <input className={inputCls} placeholder="Follow first name" value={wuFollowFirst} onChange={(e) => setWuFollowFirst(e.target.value)} />
                <input className={inputCls} placeholder="Follow last name" value={wuFollowLast} onChange={(e) => setWuFollowLast(e.target.value)} />
                <input className={inputCls} placeholder="Follow email (optional)" value={wuFollowEmail} onChange={(e) => setWuFollowEmail(e.target.value)} />
              </>
            )}
          </div>
          <button
            onClick={addWalkup}
            disabled={addingWalkup}
            className={"mt-3 " + compBtnOutline}
          >
            {addingWalkup ? "Adding…" : "Add entry"}
          </button>
        </div>
      )}

      {importOpen && (
        <div className="mb-4 rounded-xl border border-neutral-700 bg-neutral-800/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-white">Import preview</h3>
            <button onClick={() => setImportOpen(false)} className="text-sm text-neutral-400 hover:text-white">
              Close
            </button>
          </div>
          {importRows === null ? (
            <p className="text-sm text-neutral-400">Loading signups…</p>
          ) : importRows.length === 0 ? (
            <p className="text-sm text-neutral-400">
              No matching signups for this division.
            </p>
          ) : (
            <>
              <div className="max-h-80 overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-neutral-500">
                      <th className="py-1 pr-2"></th>
                      <th className="py-1 pr-2">Lead</th>
                      <th className="py-1 pr-2">Follow</th>
                      <th className="py-1">Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r) => (
                      <tr key={r.signupId} className="border-t border-neutral-800">
                        <td className="py-1.5 pr-2">
                          {r.alreadyImported ? (
                            <span className="text-xs text-neutral-500">Imported</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={selected.has(r.signupId)}
                              disabled={r.warnings.some((w) => w.includes("is a judge"))}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(r.signupId);
                                else next.delete(r.signupId);
                                setSelected(next);
                              }}
                            />
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-neutral-200">{r.leadName || "—"}</td>
                        <td className="py-1.5 pr-2 text-neutral-200">{r.followName || "—"}</td>
                        <td className="py-1.5 text-xs text-amber-400">
                          {r.warnings.join("; ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={runImport}
                disabled={importing || selected.size === 0}
                className={"mt-3 " + compBtnOutline}
              >
                {importing ? "Importing…" : `Import ${selected.size} selected`}
              </button>
            </>
          )}
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Entries ({baseEntries.length})
      </h3>
      {baseEntries.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          No entries yet. Import from signups or add walk-ups.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-neutral-500">
              <th className="py-1 pr-3">Bib</th>
              <th className="py-1 pr-3">{isJnJ ? "Competitor" : "Couple"}</th>
              {isJnJ && <th className="py-1 pr-3">Role</th>}
              <th className="py-1 pr-3">Source</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {baseEntries.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800">
                <td className="py-2 pr-3 font-mono text-neutral-300">
                  {entryBib(e) ?? "—"}
                </td>
                <td className="py-2 pr-3 text-white">{entryName(e)}</td>
                {isJnJ && (
                  <td className="py-2 pr-3 capitalize text-neutral-400">{e.role}</td>
                )}
                <td className="py-2 pr-3 text-xs text-neutral-500">
                  {e.comp_signup_id ? "Signup" : "Walk-up"}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => removeEntry(e.id)}
                    className="text-xs text-neutral-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {drawnCouples.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Finals couples from the draw ({drawnCouples.length})
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {drawnCouples.map((e) => (
                <tr key={e.id} className="border-t border-neutral-800">
                  <td className="py-2 pr-3 font-mono text-neutral-300">
                    {e.lead_bib?.bib_number ?? "—"}
                  </td>
                  <td className="py-2 text-white">{entryName(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
