"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import RelativePlacementGrid from "@/components/comps/RelativePlacementGrid";
import CallbackResultsTable from "@/components/comps/CallbackResultsTable";

const ROUND_LABEL: Record<string, string> = {
  prelims: "Prelims",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

const TYPE_LABEL: Record<string, string> = {
  jack_and_jill: "Jack & Jill",
  strictly: "Strictly",
};

export default function PublicCompetitionPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = use(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/comps/results/${competitionId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? "Failed to load results");
        }
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [competitionId]);

  if (error) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <p className="mb-4 text-red-300">{error}</p>
        <Link href="/comps" className="text-sm text-primary">
          ← All results
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

  const { competition, rounds } = data;
  // Show finals first, then earlier rounds.
  const ordered = [...rounds].sort(
    (a: any, b: any) => b.round_order - a.round_order
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/comps" className="text-sm text-neutral-400 hover:text-primary">
        ← All results
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-primary">{competition.name}</h1>
      <p className="mb-8 text-sm text-neutral-400">
        {TYPE_LABEL[competition.comp_type]} · {competition.event?.title}
        {competition.event?.starts_at &&
          ` · ${new Date(competition.event.starts_at).toLocaleDateString()}`}
      </p>

      {ordered.length === 0 && (
        <p className="py-10 text-center text-neutral-500">
          Results for this competition have not been published yet.
        </p>
      )}

      <div className="space-y-10">
        {ordered.map((round: any) => (
          <section key={round.id}>
            <h2 className="mb-3 text-lg font-semibold text-white">
              {ROUND_LABEL[round.round_type] ?? round.round_type}
              {round.judged_role &&
                ` — ${round.judged_role === "lead" ? "Leads" : "Follows"}`}
            </h2>
            {round.tabulation ? (
              round.tabulation.mode === "relative_placement" ? (
                <RelativePlacementGrid tabulation={round.tabulation} />
              ) : (
                <CallbackResultsTable
                  tabulation={round.tabulation}
                  showVotes={false}
                />
              )
            ) : (
              <p className="text-sm text-neutral-500">No grid available.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
