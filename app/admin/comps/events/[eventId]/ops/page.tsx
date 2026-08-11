"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutline } from "@/lib/comps/buttonStyles";
import {
  canAccessCompEventOps,
  canManageCompEventStaff,
  isCompAdminRole,
  type MeResponse,
} from "@/lib/comps/compAccessClient";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";

export default function EventOpsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [event, setEvent] = useState<{
    id: string;
    title: string;
    starts_at: string;
    ends_at?: string | null;
    time_zone?: string | null;
    type?: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/admin/comps/events/${eventId}/bibs`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setEvent(data.event ?? null);
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
      if (canAccessCompEventOps(meData, eventId)) await load();
      setLoading(false);
    })();
  }, [eventId, load]);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-neutral-400">
        Loading…
      </main>
    );
  }

  if (!canAccessCompEventOps(me, eventId)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-red-300">You don&apos;t have access to this event.</p>
      </main>
    );
  }

  const isAdmin = isCompAdminRole(me?.profile?.role);
  const scheduleLabel = event?.starts_at
    ? formatEventScheduleSubtitle(
        event.starts_at,
        event.ends_at,
        event.time_zone || DEFAULT_TIME_ZONE,
        event.type ?? "comp"
      )
    : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href={isAdmin ? "/admin/comps" : "/comps"}
        className="mb-4 inline-block text-sm text-neutral-400 hover:text-white"
      >
        ← Back
      </Link>

      <h1 className="text-2xl font-bold text-white">Comp event ops</h1>
      {event && (
        <>
          <p className="mt-1 text-lg text-neutral-200">{event.title}</p>
          {scheduleLabel && (
            <p className="mt-0.5 text-sm text-neutral-400">{scheduleLabel}</p>
          )}
        </>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href={`/admin/comps/events/${eventId}/bibs`}
          className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-5 transition hover:border-primary/60"
        >
          <div className="font-semibold text-white">Assign bib numbers</div>
          <p className="mt-1 text-sm text-neutral-400">
            Enter bib numbers for competitors in this event.
          </p>
        </Link>
        <Link
          href={`/admin/comps/events/${eventId}/checkin`}
          className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-5 transition hover:border-primary/60"
        >
          <div className="font-semibold text-white">Check-in</div>
          <p className="mt-1 text-sm text-neutral-400">
            Mark competitors in or out for active rounds.
          </p>
        </Link>
      </div>

      {canManageCompEventStaff(me) && (
        <p className="mt-6 text-sm text-neutral-500">
          Manage who can access these tools from the{" "}
          <Link
            href={`/admin/comps/events/${eventId}/bibs`}
            className="text-primary hover:underline"
          >
            bib assignment page
          </Link>
          .
        </p>
      )}
    </main>
  );
}
