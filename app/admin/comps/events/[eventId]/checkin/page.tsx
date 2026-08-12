"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import {
  CheckinEntryList,
  PromoteAlternateButton,
  PromoteAlternateButtons,
  type CheckinEntryRow,
} from "@/components/comps/admin/CheckinEntryList";
import {
  canAccessCompEventOps,
  isCompAdminRole,
  type MeResponse,
} from "@/lib/comps/compAccessClient";
import { roundTitle } from "@/lib/comps/roundChain";
import {
  patchEntryCheckinStatus,
  recomputeCheckinCounts,
} from "@/lib/comps/checkinOptimistic";
import { checkinSync, type CheckinReloadOptions } from "@/lib/comps/checkinSync";
import type { CheckinStatus } from "@/lib/comps/types";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";

interface CheckinRound {
  roundId: string;
  roundType: string;
  judgedRole: string | null;
  status: string;
  sourceRoundId: string | null;
  prePairing: boolean;
  leadPresent: number;
  followPresent: number;
  leadUnresolved: number;
  followUnresolved: number;
  unresolvedCheckin: number;
  presentCount: number;
  entries: CheckinEntryRow[];
}

interface CheckinDivision {
  competitionId: string;
  name: string;
  compType: string;
  rounds: CheckinRound[];
}

export default function EventCheckinPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [event, setEvent] = useState<{
    title: string;
    starts_at: string;
    ends_at?: string | null;
    time_zone?: string | null;
    type?: string | null;
  } | null>(null);
  const [divisions, setDivisions] = useState<CheckinDivision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyRound, setBusyRound] = useState<string | null>(null);

  const guardedLoad = useCallback(
    async (options?: CheckinReloadOptions) => {
      const res = await authedFetch(`/api/admin/comps/events/${eventId}/checkin`);
      if (!res.ok) {
        setError(await apiError(res));
        return;
      }
      const data = await res.json();
      if (
        options?.force ||
        (options?.generationAtSyncStart != null &&
          options.roundId != null &&
          checkinSync.shouldApplyReload(
            options.roundId,
            options.generationAtSyncStart
          )) ||
        (options?.generationAtSyncStart == null &&
          !checkinSync.hasAnyPendingOptimisticEdits())
      ) {
        setEvent(data.event ?? null);
        setDivisions(data.divisions ?? []);
        setError(null);
        if (options?.force && options.roundId) {
          checkinSync.markSynced(options.roundId);
        }
      }
    },
    [eventId]
  );

  const load = guardedLoad;

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

  useEffect(() => {
    if (!canAccessCompEventOps(me, eventId)) return;
    const interval = setInterval(() => {
      const roundIds = divisions.flatMap((d) =>
        d.rounds.map((r) => r.roundId)
      );
      if (roundIds.some((id) => checkinSync.isSyncActive(id))) return;
      guardedLoad();
    }, 5000);
    return () => clearInterval(interval);
  }, [me, eventId, guardedLoad, divisions]);

  const setCheckin = (
    roundId: string,
    roundEntryId: string,
    checkin_status: CheckinStatus
  ) => {
    checkinSync.enqueue({
      roundId,
      roundEntryId,
      checkin_status,
      onOptimistic: () => {
        checkinSync.bumpGeneration(roundId);
        setDivisions((prev) =>
          prev.map((division) => ({
            ...division,
            rounds: division.rounds.map((round) => {
              if (round.roundId !== roundId) return round;
              const entries = patchEntryCheckinStatus(
                round.entries,
                roundEntryId,
                checkin_status
              );
              return {
                ...round,
                entries,
                ...recomputeCheckinCounts(entries, round.prePairing),
              };
            }),
          }))
        );
        setError(null);
      },
      onError: setError,
      reloadRound: guardedLoad,
    });
  };

  const promoteAlternate = async (roundId: string, role?: "lead" | "follow") => {
    setBusyRound(roundId);
    setError(null);
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}/checkin`, {
      method: "POST",
      body: JSON.stringify({
        action: "promote_alternate",
        ...(role ? { role } : {}),
      }),
    });
    setBusyRound(null);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    checkinSync.scheduleSyncAfterChange(roundId, {
      onOptimistic: () => {},
      onError: setError,
      reloadRound: guardedLoad,
    });
  };

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
        href={`/admin/comps/events/${eventId}/ops`}
        className="mb-4 inline-block text-sm text-neutral-400 hover:text-white"
      >
        ← Back to event ops
      </Link>

      <h1 className="text-2xl font-bold text-white">Check-in</h1>
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

      {divisions.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">
          No rounds in check-in or scoring yet.
          {isAdmin && " Begin check-in from the competition admin console."}
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {divisions.map((division) => (
            <section key={division.competitionId}>
              <h2 className="mb-4 text-lg font-semibold text-white">
                {division.name}
              </h2>
              <div className="space-y-6">
                {division.rounds.map((round) => {
                  const label = roundTitle({
                    round_type: round.roundType as "prelims",
                    judged_role: round.judgedRole as "lead" | null,
                  });
                  const busy = busyRound === round.roundId;
                  const leadEntries = round.prePairing
                    ? round.entries.filter((e) => e.checkin_role === "lead")
                    : [];
                  const followEntries = round.prePairing
                    ? round.entries.filter((e) => e.checkin_role === "follow")
                    : [];

                  return (
                    <div
                      key={round.roundId}
                      className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-4"
                    >
                      <h3 className="mb-1 font-semibold text-white">{label}</h3>
                      <p className="mb-4 text-sm text-neutral-400">
                        {round.presentCount} in / {round.unresolvedCheckin} pending
                        · status: {round.status}
                      </p>

                      {round.prePairing ? (
                        <PromoteAlternateButtons
                          busy={busy}
                          onPromoteLead={() =>
                            promoteAlternate(round.roundId, "lead")
                          }
                          onPromoteFollow={() =>
                            promoteAlternate(round.roundId, "follow")
                          }
                        />
                      ) : (
                        round.sourceRoundId && (
                          <PromoteAlternateButton
                            busy={busy}
                            onClick={() => promoteAlternate(round.roundId)}
                          />
                        )
                      )}

                      {round.prePairing ? (
                        <>
                          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                            Leads ({round.leadPresent} in / {round.leadUnresolved}{" "}
                            pending)
                          </h4>
                          <CheckinEntryList
                            entries={leadEntries}
                            onSetStatus={(id, status) =>
                              setCheckin(round.roundId, id, status)
                            }
                          />
                          <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                            Follows ({round.followPresent} in /{" "}
                            {round.followUnresolved} pending)
                          </h4>
                          <CheckinEntryList
                            entries={followEntries}
                            onSetStatus={(id, status) =>
                              setCheckin(round.roundId, id, status)
                            }
                          />
                        </>
                      ) : (
                        <CheckinEntryList
                          entries={round.entries}
                          onSetStatus={(id, status) =>
                            setCheckin(round.roundId, id, status)
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
