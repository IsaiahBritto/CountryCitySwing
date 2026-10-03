"use client";

import PastCompsSection from "@/components/comps/hub/PastCompsSection";
import TnStateWinnersFeatured from "@/components/comps/hub/TnStateWinnersFeatured";
import type { HubPastEvent } from "@/lib/comps/hubTypes";
import {
  collectTnStateWinners,
  featuredTnStateEvent,
  pastExcludingTnState,
} from "@/lib/comps/tnStateWinners";

export default function CompetitionResultsSection({
  past,
}: {
  past: HubPastEvent[];
}) {
  const hasTnWinners = collectTnStateWinners(past).length > 0;
  const featuredEvent = featuredTnStateEvent(past);
  const generalPast = pastExcludingTnState(past);
  const showEmpty =
    past.length === 0 ||
    (!hasTnWinners && generalPast.length === 0);

  return (
    <section className="mb-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Competition results
      </h2>

      {showEmpty ? (
        <p className="text-sm text-neutral-500">
          No published results yet — check back after the next comp!
        </p>
      ) : (
        <>
          {hasTnWinners && featuredEvent && (
            <TnStateWinnersFeatured event={featuredEvent} />
          )}
          {generalPast.length > 0 ? (
            <PastCompsSection past={generalPast} hideHeading />
          ) : null}
        </>
      )}
    </section>
  );
}
