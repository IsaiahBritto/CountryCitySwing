"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";

type NonCcsEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  time_zone?: string | null;
  description?: string | null;
};

export default function NonCcsEventsPage() {
  const [events, setEvents] = useState<NonCcsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/non-ccs-events")
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-white">
      <Link href="/" className="text-sm text-neutral-400 hover:text-white">
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-primary">Non-CCS Events</h1>
      <p className="mt-2 text-neutral-400">
        Community-hosted competitions approved by CCS.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/host/comps" className="btn-signup text-sm px-4 py-2">
          Host a comp
        </Link>
      </div>

      {loading && <p className="mt-8 text-neutral-400">Loading…</p>}
      {!loading && events.length === 0 && (
        <p className="mt-8 text-neutral-400">No upcoming events yet.</p>
      )}
      <ul className="mt-8 space-y-4">
        {events.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-5"
          >
            <Link href={`/non-ccs-events/${e.id}`} className="block hover:opacity-90">
              <h2 className="text-xl font-semibold text-primary">{e.title}</h2>
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
