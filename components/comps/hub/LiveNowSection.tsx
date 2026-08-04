"use client";

import Link from "next/link";
import {
  COMP_TYPE_LABEL,
  ROUND_TYPE_LABEL,
  type HubLiveCompetition,
} from "@/lib/comps/hubTypes";
import TestBadge from "@/components/comps/hub/TestBadge";

function resultsHref(
  competitionId: string,
  latest: HubLiveCompetition["latestPublishedRound"]
): string {
  if (!latest) return `/comps/${competitionId}`;
  const params = new URLSearchParams({ round: latest.round_type });
  if (latest.judged_role === "lead" || latest.judged_role === "follow") {
    params.set("role", latest.judged_role);
  }
  return `/comps/${competitionId}?${params.toString()}`;
}

function resultsLabel(
  latest: NonNullable<HubLiveCompetition["latestPublishedRound"]>
): string {
  const round = ROUND_TYPE_LABEL[latest.round_type] ?? latest.round_type;
  if (latest.judged_role === "lead") return `${round} — Leads →`;
  if (latest.judged_role === "follow") return `${round} — Follows →`;
  return `${round} results →`;
}

export default function LiveNowSection({
  live,
}: {
  live: HubLiveCompetition[];
}) {
  if (live.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
        Live now
      </h2>
      <div className="space-y-3">
        {live.map((comp) => {
          const latest = comp.latestPublishedRound;
          return (
            <div
              key={comp.id}
              className="rounded-xl border border-primary/50 bg-primary/10 p-4 shadow-[0_0_24px_rgba(242,201,76,0.12)]"
            >
              <div className="font-semibold text-white">
                {comp.name}
                {comp.test_comp && <TestBadge />}
              </div>
              <div className="mt-0.5 text-sm text-neutral-400">
                {COMP_TYPE_LABEL[comp.comp_type] ?? comp.comp_type}
                {comp.event?.title ? ` · ${comp.event.title}` : ""}
              </div>
              {latest ? (
                <Link
                  href={resultsHref(comp.id, latest)}
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  {resultsLabel(latest)}
                </Link>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">
                  Results coming soon.{" "}
                  <Link
                    href={`/comps/${comp.id}`}
                    className="text-primary hover:underline"
                  >
                    Open competition →
                  </Link>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
