"use client";

import { useEffect, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";

interface JudgeRow {
  id: string;
  judge_role: "judge" | "chief_judge";
  profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

interface ProfileResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export default function JudgesTab({
  competitionId,
  judges,
  cjInPanel,
  onChanged,
}: {
  competitionId: string;
  judges: JudgeRow[];
  cjInPanel: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [assignRole, setAssignRole] = useState<"judge" | "chief_judge">("judge");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await authedFetch(
        `/api/admin/comps/${competitionId}/judges?q=${encodeURIComponent(query.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.profiles ?? []);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, competitionId]);

  const assign = async (profileId: string) => {
    setBusy(true);
    setError(null);
    const res = await authedFetch(`/api/admin/comps/${competitionId}/judges`, {
      method: "POST",
      body: JSON.stringify({ profile_id: profileId, judge_role: assignRole }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setQuery("");
    setResults([]);
    onChanged();
  };

  const remove = async (assignmentId: string) => {
    if (!confirm("Remove this judge?")) return;
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/judges?assignment_id=${assignmentId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    onChanged();
  };

  const toggleCjInPanel = async () => {
    const res = await authedFetch(`/api/admin/comps/${competitionId}`, {
      method: "PATCH",
      body: JSON.stringify({ cj_in_panel: !cjInPanel }),
    });
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    onChanged();
  };

  const panel = judges.filter((j) => j.judge_role === "judge");
  const cj = judges.find((j) => j.judge_role === "chief_judge") ?? null;
  const effectivePanel = panel.length + (cjInPanel && cj ? 1 : 0);
  const evenPanel = effectivePanel > 0 && effectivePanel % 2 === 0;

  const name = (j: JudgeRow) =>
    `${j.profile?.first_name ?? ""} ${j.profile?.last_name ?? ""}`.trim() ||
    j.profile?.email ||
    "Unknown";

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-4 rounded-xl border border-neutral-700 bg-neutral-800/60 p-4">
        <h3 className="mb-3 font-semibold text-white">Assign a judge</h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="min-w-64 flex-1 rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
          />
          <select
            value={assignRole}
            onChange={(e) => setAssignRole(e.target.value as any)}
            className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
          >
            <option value="judge">Judge</option>
            <option value="chief_judge">Chief judge</option>
          </select>
        </div>
        {results.length > 0 && (
          <div className="mt-2 divide-y divide-neutral-800 rounded-md border border-neutral-700 bg-neutral-900">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => assign(p.id)}
                disabled={busy}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800"
              >
                <span className="text-white">
                  {`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "No name"}
                </span>
                <span className="text-neutral-500">{p.email}</span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Judges must have an account. Competitors in this competition cannot be
          assigned as judges.
        </p>
      </div>

      {evenPanel && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
          The effective panel has an even number of judges ({effectivePanel}).
          Ties become more likely and the chief judge tie-break becomes
          essential. Consider an odd panel.
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Panel ({panel.length} judge{panel.length === 1 ? "" : "s"})
      </h3>
      {panel.length === 0 && (
        <p className="mb-4 text-sm text-neutral-500">No judges assigned yet.</p>
      )}
      <div className="space-y-2">
        {panel.map((j) => (
          <div
            key={j.id}
            className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800/40 px-3 py-2"
          >
            <div>
              <span className="text-white">{name(j)}</span>
              <span className="ml-2 text-xs text-neutral-500">{j.profile?.email}</span>
            </div>
            <button
              onClick={() => remove(j.id)}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Chief judge
      </h3>
      {cj ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-neutral-800/40 px-3 py-2">
          <div>
            <span className="text-white">{name(cj)}</span>
            <span className="ml-2 text-xs text-neutral-500">{cj.profile?.email}</span>
          </div>
          <button
            onClick={() => remove(cj.id)}
            className="text-xs text-neutral-500 hover:text-red-400"
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          No chief judge assigned. A CJ is needed to break otherwise-unresolvable
          ties.
        </p>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
        <input type="checkbox" checked={cjInPanel} onChange={toggleCjInPanel} />
        Chief judge scores count in the panel (small events). When unchecked,
        CJ scores are used for tie-breaks only.
      </label>
    </div>
  );
}
