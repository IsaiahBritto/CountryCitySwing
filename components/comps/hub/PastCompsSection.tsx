"use client";

import Link from "next/link";
import {
  COMP_TYPE_LABEL,
  ordinalLabel,
  type HubPastEvent,
} from "@/lib/comps/hubTypes";
import TestBadge from "@/components/comps/hub/TestBadge";

export default function PastCompsSection({ past }: { past: HubPastEvent[] }) {
  if (past.length === 0) {
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
    <section className="mb-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Past comps &amp; results
      </h2>
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
                  {comp.podium && comp.podium.length > 0 ? (
                    <ol className="mt-3 space-y-1 border-t border-neutral-700/80 pt-3">
                      {comp.podium.map((p) => (
                        <li
                          key={`${p.placement}-${p.displayName}`}
                          className="flex items-baseline gap-2 text-sm"
                        >
                          <span className="w-8 shrink-0 font-semibold text-primary">
                            {ordinalLabel(p.placement)}
                          </span>
                          <span className="w-10 shrink-0 font-mono text-neutral-500">
                            {p.bibNumber ?? "—"}
                          </span>
                          <span className="text-neutral-200">{p.displayName}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-500">
                      Results in progress
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
