"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import RelativePlacementGrid from "@/components/comps/RelativePlacementGrid";
import CallbackResultsTable from "@/components/comps/CallbackResultsTable";
import JudgeRoleToggle from "@/components/comps/judge/JudgeRoleToggle";
import type { DanceRole } from "@/lib/comps/types";

const ROUND_LABEL: Record<string, string> = {
  prelims: "Prelims",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

const ROUND_ORDER = ["prelims", "quarterfinal", "semifinal", "final"] as const;

const TYPE_LABEL: Record<string, string> = {
  jack_and_jill: "Jack & Jill",
  strictly: "Strictly",
};

interface PublishedRound {
  id: string;
  round_type: string;
  judged_role: string | null;
  scoring_mode: string;
  round_order: number;
  tabulation: any;
  published_at: string | null;
}

export default function PublicCompetitionResults({
  competitionId,
  backHref,
  backLabel = "← Back",
  resultsApiPath,
  pagePathBase,
}: {
  competitionId: string;
  backHref: string;
  backLabel?: string;
  /** e.g. /api/comps/results/:id or non-CCS results API */
  resultsApiPath: string;
  /** Base path for URL round/role sync (no query), e.g. /comps/uuid */
  pagePathBase: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<{
    competition: {
      id: string;
      name: string;
      comp_type: string;
      status: string;
      event: {
        id?: string;
        title: string;
        starts_at: string | null;
        host_kind?: string | null;
      } | null;
    };
    rounds: PublishedRound[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    fetch(resultsApiPath)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const redirect = body?.nonCcsRedirect as string | undefined;
          if (redirect && pagePathBase.startsWith("/comps/")) {
            setRedirecting(true);
            const qs = window.location.search;
            router.replace(`${redirect}${qs}`);
            return null;
          }
          throw new Error(body?.error ?? "Failed to load results");
        }
        return body;
      })
      .then((payload) => {
        if (payload) setData(payload);
      })
      .catch((err) => setError(err.message));
  }, [competitionId, resultsApiPath, pagePathBase, router]);

  const roundTypes = useMemo((): string[] => {
    if (!data) return [];
    const types = new Set(data.rounds.map((r) => r.round_type));
    const ordered = ROUND_ORDER.filter((t) => types.has(t));
    const extra = [...types].filter(
      (t) => !ROUND_ORDER.includes(t as (typeof ROUND_ORDER)[number])
    );
    return [...ordered, ...extra];
  }, [data]);

  const defaultRoundType = useMemo(() => {
    if (!data || data.rounds.length === 0) return null;
    const byPublished = [...data.rounds].sort((a, b) => {
      const aPub = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bPub = b.published_at ? new Date(b.published_at).getTime() : 0;
      if (bPub !== aPub) return bPub - aPub;
      return b.round_order - a.round_order;
    });
    return byPublished[0]?.round_type ?? null;
  }, [data]);

  const queryRound = searchParams.get("round");
  const selectedRoundType =
    queryRound && roundTypes.includes(queryRound)
      ? queryRound
      : defaultRoundType;

  const roundsForType = useMemo(() => {
    if (!data || !selectedRoundType) return [] as PublishedRound[];
    return data.rounds.filter((r) => r.round_type === selectedRoundType);
  }, [data, selectedRoundType]);

  const leadRound = roundsForType.find((r) => r.judged_role === "lead") ?? null;
  const followRound =
    roundsForType.find((r) => r.judged_role === "follow") ?? null;
  const showRoleToggle = !!(leadRound && followRound);

  const queryRole = searchParams.get("role");
  const selectedRole: DanceRole =
    showRoleToggle && (queryRole === "lead" || queryRole === "follow")
      ? queryRole
      : "lead";

  const activeRound = showRoleToggle
    ? selectedRole === "follow"
      ? followRound
      : leadRound
    : roundsForType[0] ?? null;

  const syncUrl = (roundType: string, role: DanceRole | null) => {
    const params = new URLSearchParams();
    params.set("round", roundType);
    if (role) params.set("role", role);
    router.replace(`${pagePathBase}?${params.toString()}`, {
      scroll: false,
    });
  };

  if (redirecting) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-center text-neutral-400">Redirecting…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <p className="mb-4 text-red-300">{error}</p>
        <Link href={backHref} className="text-sm text-primary">
          {backLabel}
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-center text-neutral-400">Loading results…</p>
      </div>
    );
  }

  const { competition } = data;
  const showVotes = competition.status === "completed";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href={backHref} className="text-sm text-neutral-400 hover:text-primary">
        {backLabel}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-primary">{competition.name}</h1>
      <p className="mb-6 text-sm text-neutral-400">
        {TYPE_LABEL[competition.comp_type] ?? competition.comp_type}
        {competition.event?.title ? ` · ${competition.event.title}` : ""}
        {competition.event?.starts_at &&
          ` · ${new Date(competition.event.starts_at).toLocaleDateString()}`}
      </p>

      {roundTypes.length === 0 ? (
        <p className="py-10 text-center text-neutral-500">
          Results for this competition have not been published yet.
        </p>
      ) : (
        <>
          {!showVotes && (
            <p className="mb-4 rounded-md border border-neutral-700 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-400">
              Placements and callback results are shown below. Chief judge scores
              are visible in the results table; full panel scores will be posted
              when the competition is marked complete.
            </p>
          )}

          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-neutral-800 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {roundTypes.map((type) => {
              const active = type === selectedRoundType;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    const forType = data.rounds.filter(
                      (r) => r.round_type === type
                    );
                    const hasBoth =
                      forType.some((r) => r.judged_role === "lead") &&
                      forType.some((r) => r.judged_role === "follow");
                    syncUrl(type, hasBoth ? selectedRole : null);
                  }}
                  className={
                    "shrink-0 whitespace-nowrap px-4 py-2 text-xs sm:text-sm font-medium transition " +
                    (active
                      ? "border-b-2 border-primary text-primary"
                      : "text-neutral-400 hover:text-white")
                  }
                >
                  {ROUND_LABEL[type] ?? type}
                </button>
              );
            })}
          </div>

          {showRoleToggle && (
            <div className="mb-4 max-w-xs">
              <JudgeRoleToggle
                activeRole={selectedRole}
                onRoleChange={(role) => {
                  if (selectedRoundType) syncUrl(selectedRoundType, role);
                }}
              />
            </div>
          )}

          {activeRound?.tabulation ? (
            activeRound.tabulation.mode === "relative_placement" ? (
              <RelativePlacementGrid
                tabulation={activeRound.tabulation}
                showJudgeDetail={showVotes}
              />
            ) : (
              <CallbackResultsTable
                tabulation={activeRound.tabulation}
                showVotes={showVotes}
              />
            )
          ) : (
            <p className="text-sm text-neutral-500">No grid available.</p>
          )}
        </>
      )}
    </div>
  );
}