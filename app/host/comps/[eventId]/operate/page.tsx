"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import EventCompetitionNav from "@/components/comps/host/EventCompetitionNav";
import {
  canManageCompEvent,
  type MeResponse,
} from "@/lib/comps/compAccessClient";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";

type OperateCompetition = {
  id: string;
  name: string;
  comp_type: string;
  status: string;
  entryCount: number;
  importableCount: number;
};

type OperateEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  time_zone?: string | null;
  type?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  jack_and_jill: "Jack & Jill",
  strictly: "Strictly",
  all_american: "All American",
};

export default function HostOperateEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const hubHref = `/host/comps/${eventId}/operate`;
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [event, setEvent] = useState<OperateEvent | null>(null);
  const [competitions, setCompetitions] = useState<OperateCompetition[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/non-ccs-events/${eventId}/operate-summary`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setEvent(data.event ?? null);
    setCompetitions(data.competitions ?? []);
    setError(null);
  }, [eventId]);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const meRes = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const meData = meRes.ok ? await meRes.json() : null;
      setMe(meData);
      if (canManageCompEvent(meData, eventId)) {
        await load();
      }
      setLoading(false);
    })();
  }, [eventId, load]);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-neutral-400">Loading…</main>
    );
  }

  if (!canManageCompEvent(me, eventId)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-red-300">You don&apos;t have access to operate this event.</p>
        <Link href="/host/comps" className="mt-4 inline-block text-sm text-primary">
          ← My Non-CCS comp events
        </Link>
      </main>
    );
  }

  const scheduleLabel = event?.starts_at
    ? formatEventScheduleSubtitle(
        event.starts_at,
        event.ends_at,
        event.time_zone || DEFAULT_TIME_ZONE,
        event.type ?? "comp"
      )
    : null;

  const cardCls =
    "rounded-xl border border-neutral-700 bg-neutral-800/50 p-5 transition hover:border-primary/60";

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 text-white">
      <Link href="/host/comps" className="text-sm text-neutral-400 hover:text-white">
        ← My Non-CCS comp events
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Operate event</h1>
          {event && (
            <>
              <p className="mt-1 text-lg text-neutral-200">{event.title}</p>
              {scheduleLabel && (
                <p className="mt-0.5 text-sm text-neutral-400">{scheduleLabel}</p>
              )}
            </>
          )}
        </div>
        <Link
          href={`/host/comps/${eventId}/edit`}
          className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Edit event details
        </Link>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6">
        <EventCompetitionNav
          eventId={eventId}
          competitions={competitions}
          hubHref={hubHref}
          activeSection="hub"
        />
      </div>

      <ol className="mt-2 space-y-4 text-sm text-neutral-400">
        <li>
          <span className="font-semibold text-neutral-200">1. Roster &amp; bibs</span> — one
          list for the whole event (shared signup registration).
        </li>
        <li>
          <span className="font-semibold text-neutral-200">2. Import signups</span> — bring
          registrants into each division.
        </li>
        <li>
          <span className="font-semibold text-neutral-200">3. Run divisions</span> — entries,
          judges, and rounds per competition.
        </li>
      </ol>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Step 1 — Roster &amp; bib numbers</h2>
        <Link href={`/admin/comps/events/${eventId}/bibs`} className={`mt-3 block ${cardCls}`}>
          <div className="font-semibold text-white">Assign bib numbers</div>
          <p className="mt-1 text-sm text-neutral-400">
            View everyone registered for this event, mark payments, and assign bib numbers once
            for all divisions.
          </p>
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Step 2 — Import into divisions</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Signups register once for the event; import copies them into each division you run.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {competitions.length === 0 ? (
            <p className="text-sm text-neutral-500">No divisions yet — add them in admin or contact support.</p>
          ) : (
            competitions.map((c) => (
              <Link
                key={c.id}
                href={`/admin/comps/${c.id}?import=1`}
                className={cardCls}
              >
                <div className="font-semibold text-white">{c.name}</div>
                <p className="mt-1 text-xs text-neutral-500">
                  {TYPE_LABEL[c.comp_type] ?? c.comp_type}
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  {c.entryCount} entr{c.entryCount === 1 ? "y" : "ies"} ·{" "}
                  {c.importableCount} signup{c.importableCount === 1 ? "" : "s"} ready to import
                </p>
                <p className="mt-2 text-sm text-primary">Import signups →</p>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Step 3 — Run each division</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {competitions.map((c) => (
            <Link key={c.id} href={`/admin/comps/${c.id}`} className={cardCls}>
              <div className="font-semibold text-white">{c.name}</div>
              <p className="mt-1 text-sm text-neutral-400">
                {TYPE_LABEL[c.comp_type] ?? c.comp_type} · {c.entryCount} entries ·{" "}
                {c.status.replace("_", " ")}
              </p>
              <p className="mt-2 text-sm text-primary">Open division console →</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Day of event</h2>
        <Link
          href={`/admin/comps/events/${eventId}/checkin`}
          className={`mt-3 block ${cardCls}`}
        >
          <div className="font-semibold text-white">Check-in</div>
          <p className="mt-1 text-sm text-neutral-400">
            Mark competitors in or out for active rounds.
          </p>
        </Link>
      </section>
    </main>
  );
}
