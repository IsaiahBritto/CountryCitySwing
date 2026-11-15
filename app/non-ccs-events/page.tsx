"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import NonCcsEventsTabToggle, {
  type NonCcsEventsTab,
} from "@/components/nonCcs/NonCcsEventsTabToggle";
import type { PublicCommunityEventListItem } from "@/lib/nonCcsPublicEvents";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";

export default function NonCcsEventsPage() {
  const [tab, setTab] = useState<NonCcsEventsTab>("upcoming");
  const [upcoming, setUpcoming] = useState<PublicCommunityEventListItem[]>([]);
  const [past, setPast] = useState<PublicCommunityEventListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/non-ccs-events")
      .then((r) => r.json())
      .then((d) => {
        setUpcoming(d.upcoming ?? []);
        setPast(d.past ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const events = tab === "upcoming" ? upcoming : past;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-white">
      <Link href="/" className="text-sm text-neutral-400 hover:text-white">
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-primary">Non-CCS Events</h1>
      <p className="mt-2 text-neutral-400">
        Community-hosted competitions approved by CCS.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <NonCcsEventsTabToggle active={tab} onChange={setTab} />
        <Link href="/host/comps" className="btn-signup text-sm px-4 py-2">
          Host a comp
        </Link>
      </div>

      {loading && <p className="mt-8 text-neutral-400">Loading…</p>}
      {!loading && events.length === 0 && (
        <p className="mt-8 text-neutral-400">
          {tab === "upcoming"
            ? "No upcoming community comps."
            : "No past events yet."}
        </p>
      )}
      <ul className="mt-8 space-y-4">
        {events.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-5"
          >
            <Link
              href={`/non-ccs-events/${encodeURIComponent(e.publicSlug)}`}
              className="block hover:opacity-90"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-primary">{e.title}</h2>
                {tab === "past" && e.hasPublishedResults && (
                  <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Results posted
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-400">
                {formatEventScheduleSubtitle(
                  e.starts_at,
                  e.ends_at,
                  e.time_zone || DEFAULT_TIME_ZONE,
                  "Comp"
                )}
              </p>
              {e.location && (
                <p className="mt-1 text-sm text-neutral-300">{e.location}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}