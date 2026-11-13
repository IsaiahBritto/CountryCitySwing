"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import CommunityCompSignupModal from "@/components/CommunityCompSignupModal";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";
import { formatDivisionListLabel } from "@/lib/comps/divisionDisplay";

export default function NonCcsEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<any>(null);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    fetch(`/api/non-ccs-events/${eventId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEvent(d));
  }, [eventId]);

  if (!event?.event) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-neutral-400">
        Loading…
      </main>
    );
  }

  const e = event.event;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-white">
      <Link href="/non-ccs-events" className="text-sm text-neutral-400 hover:text-white">
        ← Non-CCS Events
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-primary">{e.title}</h1>
      <p className="mt-2 text-neutral-400">
        {formatEventScheduleSubtitle(
          e.starts_at,
          e.ends_at,
          e.time_zone || DEFAULT_TIME_ZONE,
          "Comp"
        )}
      </p>
      {e.location && <p className="mt-1 text-neutral-300">{e.location}</p>}
      {e.description && <p className="mt-4 text-neutral-200">{e.description}</p>}
      {(event.competitions ?? []).length > 0 && (
        <ul className="mt-4 list-inside list-disc text-neutral-300">
          {(event.competitions as { id: string; name: string; comp_type: string }[]).map(
            (c) => (
              <li key={c.id}>
                {formatDivisionListLabel(c.name, c.comp_type)}
              </li>
            )
          )}
        </ul>
      )}
      <button
        type="button"
        className="btn-signup mt-8 px-6 py-2"
        onClick={() => setShowSignup(true)}
      >
        Sign up
      </button>
      <CommunityCompSignupModal
        event={e}
        initialCompetitions={
          (event.competitions ?? []) as {
            id: string;
            name: string;
            comp_type: string;
          }[]
        }
        open={showSignup}
        onClose={() => setShowSignup(false)}
      />
    </main>
  );
}
