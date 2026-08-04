"use client";

import CompLevelBadge from "@/components/CompLevelBadge";
import { hasCompDivisionPrice } from "@/lib/compLevels";
import { compBtnOutline } from "@/lib/comps/buttonStyles";
import type { HubUpcomingEvent, MeUpcoming } from "@/lib/comps/hubTypes";
import TestBadge from "@/components/comps/hub/TestBadge";

export default function UpcomingCompsSection({
  upcoming,
  myUpcoming,
  onSignup,
}: {
  upcoming: HubUpcomingEvent[];
  myUpcoming: MeUpcoming[];
  onSignup: (event: HubUpcomingEvent) => void;
}) {
  if (upcoming.length === 0) {
    return (
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Upcoming comps
        </h2>
        <p className="text-sm text-neutral-500">
          No upcoming competitions scheduled yet.
        </p>
      </section>
    );
  }

  const registeredEventIds = new Set(myUpcoming.map((m) => m.eventId));

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Upcoming comps
      </h2>
      <div className="space-y-3">
        {upcoming.map((event) => {
          const registered = registeredEventIds.has(event.id);
          const myReg = myUpcoming.find((m) => m.eventId === event.id);
          const hasStrictly = hasCompDivisionPrice(event.strictly_price);
          const hasJnJ = hasCompDivisionPrice(event.jnj_price);

          return (
            <div
              key={event.id}
              className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">
                    {event.title}
                    {event.test_event && <TestBadge />}
                  </div>
                  <div className="mt-1 text-sm text-neutral-400">
                    {event.starts_at &&
                      new Date(event.starts_at).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    {event.location ? ` · ${event.location}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hasStrictly && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
                        Strictly
                        <CompLevelBadge level={event.strictly_level} />
                      </span>
                    )}
                    {hasJnJ && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
                        Jack &amp; Jill
                        <CompLevelBadge level={event.jnj_level} />
                      </span>
                    )}
                  </div>
                  {registered && myReg && (
                    <p className="mt-2 text-sm text-primary">
                      You&apos;re registered
                      {myReg.bibNumber != null
                        ? ` · Bib ${myReg.bibNumber}`
                        : ""}
                      {myReg.divisions.length > 0
                        ? ` · ${myReg.divisions
                            .map((d) =>
                              d.division === "strictly"
                                ? "Strictly"
                                : "Jack & Jill"
                            )
                            .join(", ")}`
                        : ""}
                    </p>
                  )}
                </div>
                {!registered && (
                  <button
                    type="button"
                    onClick={() => onSignup(event)}
                    className={compBtnOutline}
                  >
                    Sign up
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
