"use client";

import Link from "next/link";
import CompPodiumPreview from "@/components/comps/hub/CompPodiumPreview";
import { COMP_TYPE_LABEL } from "@/lib/comps/hubTypes";
import type { AggregatedCompetitionResults } from "@/lib/comps/aggregatePublishedResults";

export default function NonCcsEventResultsOverview({
  eventSlug,
  competitions,
}: {
  eventSlug: string;
  competitions: AggregatedCompetitionResults[];
}) {
  const eventBase = `/non-ccs-events/${encodeURIComponent(eventSlug)}`;
  if (competitions.length === 0) {
    return (
      <p className="mt-8 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6 text-sm text-neutral-400">
        Results haven&apos;t been posted yet. Check back after the organizer
        publishes scores.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Competition results
      </h2>
      {competitions.map((comp) => (
        <Link
          key={comp.id}
          href={`${eventBase}/competitions/${comp.id}`}
          className="block rounded-xl border border-neutral-700 bg-neutral-800/50 p-4 transition hover:border-primary/60"
        >
          <div className="font-semibold text-white">{comp.name}</div>
          <div className="text-sm text-neutral-400">
            {COMP_TYPE_LABEL[comp.comp_type] ?? comp.comp_type}
            {comp.publishedRounds > 0 &&
              ` · ${comp.publishedRounds} published round${
                comp.publishedRounds === 1 ? "" : "s"
              }`}
          </div>
          <CompPodiumPreview podium={comp.podium} />
        </Link>
      ))}
    </div>
  );
}