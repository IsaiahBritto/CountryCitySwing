"use client";

import { Suspense, use } from "react";
import PublicCompetitionResults from "@/components/comps/PublicCompetitionResults";

export default function PublicCompetitionPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-12">
          <p className="text-center text-neutral-400">Loading results…</p>
        </div>
      }
    >
      <PublicCompetitionPageInner params={params} />
    </Suspense>
  );
}

function PublicCompetitionPageInner({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = use(params);

  return (
    <PublicCompetitionResults
      competitionId={competitionId}
      backHref="/comps"
      backLabel="← All results"
      resultsApiPath={`/api/comps/results/${competitionId}`}
      pagePathBase={`/comps/${competitionId}`}
    />
  );
}