"use client";

import Link from "next/link";
import CompPodiumPreview from "@/components/comps/hub/CompPodiumPreview";
import TestBadge from "@/components/comps/hub/TestBadge";
import { COMP_TYPE_LABEL, type HubPastEvent } from "@/lib/comps/hubTypes";

export default function PastCompsSection({
  past,
  hideHeading = false,
}: {
  past: HubPastEvent[];
  hideHeading?: boolean;
}) {
  if (past.length === 0) {
    if (hideHeading) return null;
    return (
      <section className="mb-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Past comps &amp; results
        </h2>
        <p className="text-sm text-neutral-500">
          No published results yet — check back after the next comp!
        </p>
      </section>
    );
  }

  return (
    <section className={hideHeading ? "" : "mb-4"}>
      {!hideHeading && (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Past comps &amp; results
        </h2>
      )}
      <div className="space-y-6">
        {past.map((event) => (
          <div key={event.id}>
            <h3 className="mb-2 text-base font-semibold text-white">
              {event.title}
              {event.test_event && <TestBadge />}
              {event.starts_at && (
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  {new Date(event.starts_at).toLocaleDateString()}
                </span>
              )}
            </h3>
            <div className="space-y-2">
              {event.competitions.map((comp) => (
                <Link
                  key={comp.id}
                  href={`/comps/${comp.id}`}
                  className="block rounded-xl border border-neutral-700 bg-neutral-800/50 p-4 transition hover:border-primary/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white">
                        {comp.name}
                        {comp.test_comp && <TestBadge />}
                      </div>
                      <div className="text-sm text-neutral-400">
                        {COMP_TYPE_LABEL[comp.comp_type] ?? comp.comp_type}
                        {" · "}
                        {comp.publishedRounds} published round
                        {comp.publishedRounds === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <CompPodiumPreview podium={comp.podium} />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
