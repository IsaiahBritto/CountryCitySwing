"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { hasDuplicateChiefJudges } from "@/lib/comps/judgeDisplayCount";
import { buildJudgeColumnPreviews } from "@/lib/comps/judgeColumnPreview";
import {
  isHeadJudgeLockedForRole,
  judgeEligibleForHeadJudgeRole,
} from "@/lib/comps/judgeScope";
import type { JudgeWithProfile } from "@/lib/comps/roundData";
import type { CompRoundRow, ScoringScope } from "@/lib/comps/types";
import JudgeColumnPreviewCard from "@/components/comps/admin/JudgeColumnPreview";

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

function toJudgeWithProfile(j: JudgeRow): JudgeWithProfile {
  return {
    id: j.id,
    competition_id: "",
    profile_id: j.profile?.id ?? "",
    judge_role: j.judge_role,
    scoring_scope: j.scoring_scope ?? "both",
    drops_finals: j.drops_finals ?? false,
    first_name: j.profile?.first_name ?? "",
    last_name: j.profile?.last_name ?? "",
    email: j.profile?.email ?? null,
  };
}

export default function JudgesTab({
  competitionId,
  compType,
  judges,
  rounds,
  cjInPanel,
  leadHeadJudgeAssignmentId,
  followHeadJudgeAssignmentId,
  onChanged,
}: {
  competitionId: string;
  compType: "jack_and_jill" | "strictly";
  judges: JudgeRow[];
  rounds: Pick<CompRoundRow, "round_type" | "judged_role" | "status">[];
  cjInPanel: boolean;
  leadHeadJudgeAssignmentId: string | null;
  followHeadJudgeAssignmentId: string | null;
  onChanged: () => void;
}) {
  const isJnJ = compType === "jack_and_jill";
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [assignRole, setAssignRole] = useState<"judge" | "chief_judge">("judge");
  const [assignScope, setAssignScope] = useState<ScoringScope>("both");
  const [busy, setBusy] = useState(false);
  const [leadHj, setLeadHj] = useState(leadHeadJudgeAssignmentId ?? "");
  const [followHj, setFollowHj] = useState(followHeadJudgeAssignmentId ?? "");

  useEffect(() => {
    setLeadHj(leadHeadJudgeAssignmentId ?? "");
  }, [leadHeadJudgeAssignmentId]);
  useEffect(() => {
    setFollowHj(followHeadJudgeAssignmentId ?? "");
  }, [followHeadJudgeAssignmentId]);

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

  const saveHeadJudge = async (
    role: "lead" | "follow",
    value: string
  ) => {
    setError(null);
    const field =
      role === "lead"
        ? "lead_head_judge_assignment_id"
        : "follow_head_judge_assignment_id";
    const res = await authedFetch(`/api/admin/comps/${competitionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        [field]: value || null,
      }),
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

  const leadHjLocked = isHeadJudgeLockedForRole(rounds, "lead");
  const followHjLocked = isHeadJudgeLockedForRole(rounds, "follow");
  const asymmetricHj =
    isJnJ &&
    ((leadHj && !followHj) || (!leadHj && followHj));

  const judgeProfiles = useMemo(
    () => judges.map(toJudgeWithProfile),
    [judges]
  );

  const columnPreviews = useMemo(
    () =>
      buildJudgeColumnPreviews({
        compType,
        judges: judgeProfiles,
        cjInPanel,
        leadHeadJudgeId: leadHj || null,
        followHeadJudgeId: followHj || null,
      }),
    [compType, judgeProfiles, cjInPanel, leadHj, followHj]
  );

  const eligibleForRole = (role: "lead" | "follow") =>
    panel.filter((j) => judgeEligibleForHeadJudgeRole(toJudgeWithProfile(j), role));

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
          {isJnJ && assignRole === "judge" && (
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
          {isJnJ && assignRole === "chief_judge" && (
            <> Chief judge always scores both leads and follows on JnJ.</>
          )}
        </p>
      </div>

      {duplicateCj && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          Multiple chief judge assignments found ({chiefJudges.length}). Only one
          is shown below.
        </div>
      )}
      {evenPanel && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
          The effective panel has an even number of judges ({effectivePanel}).
          Ties become more likely. Consider an odd panel.
        </div>
      )}
      {isJnJ && evenFinalsPanel && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
          The finals panel has an even number of judges ({finalsPanel}). Mark
          one judge as dropping finals to reach an odd panel.
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
                {leadHj === j.id && (
                  <span className="ml-2 text-xs text-primary">HJ leads</span>
                )}
                {followHj === j.id && (
                  <span className="ml-2 text-xs text-primary">HJ follows</span>
                )}
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

      {isJnJ && (
        <div className="mt-6 rounded-xl border border-neutral-700 bg-neutral-800/60 p-4">
          <h3 className="mb-1 font-semibold text-white">
            Head judges (callback rounds)
          </h3>
          <p className="mb-4 text-xs text-neutral-500">
            Head judge scores are the primary tie-break for lead/follow callbacks.
            Chief judge is the automatic fallback. Finals always use the chief
            judge.
          </p>
          {asymmetricHj && (
            <p className="mb-3 text-xs text-amber-400">
              Only one role has a head judge — the other uses CJ tie-break only.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-neutral-300">
              Lead head judge
              <select
                value={leadHj}
                disabled={leadHjLocked}
                onChange={(e) => {
                  setLeadHj(e.target.value);
                  saveHeadJudge("lead", e.target.value);
                }}
                className="mt-1 w-full rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                <option value="">None (CJ tie-break)</option>
                {eligibleForRole("lead").map((j) => (
                  <option key={j.id} value={j.id}>
                    {name(j)}
                  </option>
                ))}
              </select>
              {leadHjLocked && (
                <span className="mt-1 block text-xs text-neutral-500">
                  Locked — lead callback scoring has opened
                </span>
              )}
            </label>
            <label className="block text-sm text-neutral-300">
              Follow head judge
              <select
                value={followHj}
                disabled={followHjLocked}
                onChange={(e) => {
                  setFollowHj(e.target.value);
                  saveHeadJudge("follow", e.target.value);
                }}
                className="mt-1 w-full rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                <option value="">None (CJ tie-break)</option>
                {eligibleForRole("follow").map((j) => (
                  <option key={j.id} value={j.id}>
                    {name(j)}
                  </option>
                ))}
              </select>
              {followHjLocked && (
                <span className="mt-1 block text-xs text-neutral-500">
                  Locked — follow callback scoring has opened
                </span>
              )}
            </label>
          </div>
          {eligibleForRole("lead").some((j) => j.scoring_scope === "both") && (
              <button
                type="button"
                disabled={leadHjLocked && followHjLocked}
                onClick={() => {
                  const both = panel.find((j) => j.scoring_scope === "both");
                  if (!both) return;
                  if (!leadHjLocked) {
                    setLeadHj(both.id);
                    saveHeadJudge("lead", both.id);
                  }
                  if (!followHjLocked) {
                    setFollowHj(both.id);
                    saveHeadJudge("follow", both.id);
                  }
                }}
                className="mt-3 text-xs text-primary hover:underline disabled:opacity-50"
              >
                Same head judge for both (first eligible &quot;both&quot; judge)
              </button>
            )}
        </div>
      )}

      <JudgeColumnPreviewCard previews={columnPreviews} />
    </div>
  );
}
