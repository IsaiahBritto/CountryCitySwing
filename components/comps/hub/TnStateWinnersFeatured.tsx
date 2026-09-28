"use client";

import Link from "next/link";
import CompLevelBadge from "@/components/CompLevelBadge";
import CompPodiumPreview from "@/components/comps/hub/CompPodiumPreview";
import TestBadge from "@/components/comps/hub/TestBadge";
import {
  tnStateCardLinkClass,
  tnStateFeaturedShellClass,
  tnStateHeadingClass,
  tnStateLinkClass,
  tnStateMutedTextClass,
} from "@/lib/compLevels";
import { COMP_TYPE_LABEL, type HubPastEvent } from "@/lib/comps/hubTypes";
import {
  featuredTnStateCompetitions,
  type TnStateWinnerRow,
} from "@/lib/comps/tnStateWinners";

function DivisionCard({ comp }: { comp: TnStateWinnerRow["comp"] }) {
  return (
    <Link
      href={`/comps/${comp.id}`}
      className={tnStateCardLinkClass}
    >
      <div className="font-semibold text-white">
        {comp.name}
        {comp.test_comp && <TestBadge />}
      </div>
      <div className={`mt-0.5 ${tnStateMutedTextClass}`}>
        {COMP_TYPE_LABEL[comp.comp_type] ?? comp.comp_type}
        {" · "}
        {comp.publishedRounds} published round
        {comp.publishedRounds === 1 ? "" : "s"}
      </div>
      <CompPodiumPreview podium={comp.podium} />
    </Link>
  );
}

export default function TnStateWinnersFeatured({
  event,
}: {
  event: HubPastEvent;
}) {
  const tnComps = featuredTnStateCompetitions(event);

  return (
    <div className={tnStateFeaturedShellClass}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={tnStateHeadingClass}>Tennessee State Champions</h3>
          <CompLevelBadge level="TN State" />
        </div>
        <Link href="/comps/tn-state" className={tnStateLinkClass}>
          See more →
        </Link>
      </div>

      <div className="mb-3">
        <div className="text-base font-semibold text-white">
          {event.title}
          {event.test_event && <TestBadge />}
        </div>
        <div className="text-sm text-neutral-400">
          {event.starts_at &&
            new Date(event.starts_at).toLocaleDateString(undefined, {
              dateStyle: "medium",
            })}
          {event.location ? ` · ${event.location}` : ""}
        </div>
      </div>

      <div className="space-y-2">
        {tnComps.map((comp) => (
          <DivisionCard key={comp.id} comp={comp} />
        ))}
      </div>
    </div>
  );
}
