"use client";

import { useEffect, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { hasDuplicateChiefJudges } from "@/lib/comps/judgeDisplayCount";
import type { ScoringScope } from "@/lib/comps/types";

interface JudgeRow {
  id: string;
  judge_role: "judge" | "chief_judge";
  scoring_scope: ScoringScope;
  drops_finals: boolean;
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

const SCOPE_LABEL: Record<ScoringScope, string> = {
  lead: "Leads",
  follow: "Follows",
  both: "Both",
};

export default function JudgesTab({
  competitionId,
  compType,
  judges,
  cjInPanel,
  onChanged,
}: {
  competitionId: string;
  compType: "jack_and_jill" | "strictly";
  judges: JudgeRow[];
  cjInPanel: boolean;
  onChanged: () => void;
}) {
  const isJnJ = compType === "jack_and_jill";
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [assignRole, setAssignRole] = useState<"judge" | "chief_judge">("judge");
  const [assignScope, setAssignScope] = useState<ScoringScope>("both");
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
      body: JSON.stringify({
        profile_id: profileId,
        judge_role: assignRole,
        scoring_scope: isJnJ ? assignScope : "both",
      }),
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

  const patchJudge = async (
    assignmentId: string,
    patch: { scoring_scope?: ScoringScope; drops_finals?: boolean }
  ) => {
    setError(null);
    const res = await authedFetch(`/api/admin/comps/${competitionId}/judges`, {
      method: "PATCH",
      body: JSON.stringify({ assignment_id: assignmentId, ...patch }),
    });
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
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
  const chiefJudges = judges.filter((j) => j.judge_role === "chief_judge");
  const cj = chiefJudges[0] ?? null;
  const duplicateCj = hasDuplicateChiefJudges(judges);
  const effectivePanel = panel.length + (cjInPanel && cj ? 1 : 0);
  const evenPanel = effectivePanel > 0 && effectivePanel % 2 === 0;

  const finalsPanel =
    panel.filter((j) => !j.drops_finals).length +
    (cjInPanel && cj && !cj.drops_finals ? 1 : 0);
  const evenFinalsPanel = finalsPanel > 0 && finalsPanel % 2 === 0;

  const name = (j: JudgeRow) =>
    `${j.profile?.first_name ?? ""} ${j.profile?.last_name ?? ""}`.trim() ||
    j.profile?.email ||
    "Unknown";

  const scopeBadge = (scope: ScoringScope) =>
    isJnJ && scope !== "both" ? (
      <span className="ml-2 rounded bg-neutral-700/80 px-1.5 py-0.5 text-xs text-neutral-300">
        {SCOPE_LABEL[scope]}
      </span>
    ) : null;

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
            onChange={(e) => setAssignRole(e.target.value as "judge" | "chief_judge")}
            className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
          >
            <option value="judge">Judge</option>
            <option value="chief_judge">Chief judge</option>
          </select>
          {isJnJ && (
            <select
              value={assignScope}
              onChange={(e) => setAssignScope(e.target.value as ScoringScope)}
              className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
            >
              <option value="both">Scores: Both</option>
              <option value="lead">Scores: Leads</option>
              <option value="follow">Scores: Follows</option>
            </select>
          )}
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

      {duplicateCj && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          Multiple chief judge assignments found ({chiefJudges.length}). Only one
          is shown below. Click <strong>Ensure test judges</strong> on a test comp,
          or remove the extra chief judge manually.
        </div>
      )}
      {evenPanel && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
          The effective panel has an even number of judges ({effectivePanel}).
          Ties become more likely and the chief judge tie-break becomes
          essential. Consider an odd panel.
        </div>
      )}
      {isJnJ && evenFinalsPanel && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
          The finals panel has an even number of judges ({finalsPanel}). Mark
          one judge as dropping finals to reach an odd panel, or adjust CJ in
          panel settings.
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
            className="rounded-lg border border-neutral-700 bg-neutral-800/40 px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-white">{name(j)}</span>
                {scopeBadge(j.scoring_scope ?? "both")}
                {j.drops_finals && (
                  <span className="ml-2 text-xs text-amber-400">Drops finals</span>
                )}
                <div className="text-xs text-neutral-500">{j.profile?.email}</div>
              </div>
              <button
                onClick={() => remove(j.id)}
                className="text-xs text-neutral-500 hover:text-red-400"
              >
                Remove
              </button>
            </div>
            {isJnJ && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-neutral-400">
                  Scope
                  <select
                    value={j.scoring_scope ?? "both"}
                    onChange={(e) =>
                      patchJudge(j.id, {
                        scoring_scope: e.target.value as ScoringScope,
                      })
                    }
                    className="rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-white"
                  >
                    <option value="both">Both</option>
                    <option value="lead">Leads</option>
                    <option value="follow">Follows</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-neutral-400">
                  <input
                    type="checkbox"
                    checked={j.drops_finals ?? false}
                    onChange={(e) =>
                      patchJudge(j.id, { drops_finals: e.target.checked })
                    }
                  />
                  Drops finals
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Chief judge
      </h3>
      {cj ? (
        <div className="rounded-lg border border-primary/40 bg-neutral-800/40 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-white">{name(cj)}</span>
              {cj.drops_finals && (
                <span className="ml-2 text-xs text-amber-400">Drops finals</span>
              )}
              <div className="text-xs text-neutral-500">{cj.profile?.email}</div>
            </div>
            <button
              onClick={() => remove(cj.id)}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              Remove
            </button>
          </div>
          {isJnJ && (
            <label className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={cj.drops_finals ?? false}
                onChange={(e) => patchJudge(cj.id, { drops_finals: e.target.checked })}
              />
              Drops finals
              {cj.drops_finals && (
                <span className="text-amber-400">— CJ will not score finals</span>
              )}
            </label>
          )}
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
