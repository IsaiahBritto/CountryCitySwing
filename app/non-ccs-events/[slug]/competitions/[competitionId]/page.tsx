"use client";

import { Suspense, use } from "react";
import PublicCompetitionResults from "@/components/comps/PublicCompetitionResults";

export default function NonCcsCompetitionResultsPage({
  params,
}: {
  params: Promise<{ slug: string; competitionId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-12">
          <p className="text-center text-neutral-400">Loading results…</p>
        </div>
      }
    >
      <NonCcsCompetitionResultsInner params={params} />
    </Suspense>
  );
}

function NonCcsCompetitionResultsInner({
  params,
}: {
  params: Promise<{ slug: string; competitionId: string }>;
}) {
  const { slug, competitionId } = use(params);
  const eventPath = `/non-ccs-events/${encodeURIComponent(slug)}`;
  const compPath = `${eventPath}/competitions/${competitionId}`;

  return (
    <PublicCompetitionResults
      competitionId={competitionId}
      backHref={eventPath}
      backLabel="← Event"
      resultsApiPath={`/api/non-ccs-events/competitions/${competitionId}/results`}
      pagePathBase={compPath}
    />
  );
}