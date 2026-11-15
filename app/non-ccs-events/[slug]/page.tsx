"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CommunityCompSignupModal from "@/components/CommunityCompSignupModal";
import NonCcsEventResultsOverview from "@/components/nonCcs/NonCcsEventResultsOverview";
import type { AggregatedCompetitionResults } from "@/lib/comps/aggregatePublishedResults";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";
import { formatDivisionListLabel } from "@/lib/comps/divisionDisplay";
import type { PublicCommunityEventTab } from "@/lib/nonCcsPublicEvents";
type CommunityEventDetail = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  time_zone?: string | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  strictly_level?: string | null;
  jnj_level?: string | null;
  refund_statement?: string | null;
  community_payment_methods?: unknown;
  community_payment_disclaimer?: string | null;
  community_payment_disclaimer_tone?: string | null;
};

type EventPayload = {
  event: CommunityEventDetail;
  competitions: { id: string; name: string; comp_type: string }[];
  tab?: PublicCommunityEventTab;
  resultsSummary?: AggregatedCompetitionResults[];
  publicSlug?: string;
};

export default function NonCcsEventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: routeSlug } = use(params);
  const router = useRouter();
  const [payload, setPayload] = useState<EventPayload | null>(null);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    const key = decodeURIComponent(routeSlug);
    fetch(`/api/non-ccs-events/${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EventPayload | null) => {
        if (!d?.event) {
          setPayload(null);
          return;
        }
        setPayload(d);
        const canonical = d.publicSlug;
        if (canonical && key !== canonical) {
          router.replace(`/non-ccs-events/${encodeURIComponent(canonical)}`);
        }
      });
  }, [routeSlug, router]);

  if (!payload?.event) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-neutral-400">
        Loading…
      </main>
    );
  }

  const e = payload.event;
  const eventSlug = payload.publicSlug ?? decodeURIComponent(routeSlug);
  const tab = payload.tab ?? "upcoming";
  const isPast = tab === "past";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-white">
      <Link href="/non-ccs-events" className="text-sm text-neutral-400 hover:text-white">
        ← Non-CCS Events
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-primary">{e.title}</h1>
      <p className="mt-2 text-neutral-400">
        {formatEventScheduleSubtitle(
          e.starts_at,
          e.ends_at ?? null,
          e.time_zone || DEFAULT_TIME_ZONE,
          "Comp"
        )}
      </p>
      {e.location && <p className="mt-1 text-neutral-300">{e.location}</p>}
      {e.description && (
        <p className="mt-4 text-neutral-200">{e.description}</p>
      )}

      {isPast ? (
        <NonCcsEventResultsOverview
          eventSlug={eventSlug}
          competitions={payload.resultsSummary ?? []}
        />
      ) : (
        <>
          {(payload.competitions ?? []).length > 0 && (
            <ul className="mt-4 list-inside list-disc text-neutral-300">
              {payload.competitions.map((c) => (
                <li key={c.id}>
                  {formatDivisionListLabel(c.name, c.comp_type)}
                </li>
              ))}
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
            initialCompetitions={payload.competitions ?? []}
            open={showSignup}
            onClose={() => setShowSignup(false)}
          />
        </>
      )}
    </main>
  );
}