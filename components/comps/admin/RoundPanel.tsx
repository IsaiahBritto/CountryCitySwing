"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import {
  compBtnPrimary,
  compBtnSecondary,
} from "@/lib/comps/buttonStyles";
import { sortRoundEntriesByBib } from "@/lib/comps/entrySort";
import RelativePlacementGrid from "@/components/comps/RelativePlacementGrid";
import CallbackResultsTable from "@/components/comps/CallbackResultsTable";

interface RoundDetail {
  round: {
    id: string;
    round_type: string;
    judged_role: string | null;
    scoring_mode: "callback" | "relative_placement";
    callback_count: number | null;
    alternate_count: number;
    status: string;
    source_round_id: string | null;
    tabulation: any;
  };
  competition: { id: string; name: string };
  heats: { id: string; heat_number: number }[];
  results: any[];
  entries: {
    id: string;
    heat_id: string | null;
    dance_order: number | null;
    checkin_status: "pending" | "checked_in" | "absent";
    scratched: boolean;
    promoted_alternate: boolean;
    display: {
      roundEntryId: string;
      bibNumber: number | null;
      displayName: string;
    };
  }[];
  judges: {
    id: string;
    judge_role: "judge" | "chief_judge";
    first_name: string;
    last_name: string;
    isPanel: boolean;
    sheetStatus: "draft" | "submitted";
    scored: number;
    total: number;
  }[];
}

interface UnresolvedTie {
  roundEntryIds: string[];
  displays: { roundEntryId: string; bibNumber: number | null; displayName: string }[];
  reason: string;
}

export default function RoundPanel({
  roundId,
  onChanged,
}: {
  roundId: string;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<RoundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [heatCount, setHeatCount] = useState(1);
  const [ties, setTies] = useState<UnresolvedTie[] | null>(null);
  const [tieOrders, setTieOrders] = useState<string[][]>([]);
  const detailRef = useRef<RoundDetail | null>(null);
  detailRef.current = detail;

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setDetail(await res.json());
  }, [roundId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live judge progress: poll while check-in/scoring is active, and listen on
  // the round's broadcast channel for instant updates from judge devices.
  useEffect(() => {
    const interval = setInterval(() => {
      const status = detailRef.current?.round.status;
      if (status === "checkin" || status === "open") load();
    }, 5000);
    const channel = supabaseBrowser
      .channel(`comp-round-${roundId}`)
      .on("broadcast", { event: "judge_progress" }, () => load())
      .subscribe();
    return () => {
      clearInterval(interval);
      supabaseBrowser.removeChannel(channel);
    };
  }, [roundId, load]);

  const act = async (fn: () => Promise<Response>) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return false;
    }
    await load();
    onChanged();
    return true;
  };

  const transition = (status: string) =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
    );

  const setCheckin = (roundEntryId: string, checkin_status: string) =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}/checkin`, {
        method: "POST",
        body: JSON.stringify({ round_entry_id: roundEntryId, checkin_status }),
      })
    );

  const promoteAlternate = () =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}/checkin`, {
        method: "POST",
        body: JSON.stringify({ action: "promote_alternate" }),
      })
    );

  const randomizeHeats = () =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}/heats`, {
        method: "POST",
        body: JSON.stringify({ heat_count: heatCount }),
      })
    );

  const tabulate = async (resolutions: string[][] = []) => {
    setBusy(true);
    setError(null);
    setTies(null);
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}/tabulate`, {
      method: "POST",
      body: JSON.stringify({ manual_tie_resolutions: resolutions }),
    });
    setBusy(false);
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (body.unresolvedTies) {
        setTies(body.unresolvedTies);
        setTieOrders(body.unresolvedTies.map((t: UnresolvedTie) => t.roundEntryIds));
        return;
      }
      setError(body.error ?? "Tabulation blocked");
      return;
    }
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    await load();
    onChanged();
  };

  const removeTabulation = () =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}/tabulate`, {
        method: "DELETE",
      })
    );

  const publish = (method: "POST" | "DELETE") =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}/publish`, { method })
    );

  const unlockSheet = (judgeAssignmentId: string) =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}/sheets`, {
        method: "PATCH",
        body: JSON.stringify({ judge_assignment_id: judgeAssignmentId }),
      })
    );

  const moveInTie = (groupIndex: number, from: number, to: number) => {
    setTieOrders((prev) => {
      const next = prev.map((g) => [...g]);
      const group = next[groupIndex];
      if (to < 0 || to >= group.length) return prev;
      const [item] = group.splice(from, 1);
      group.splice(to, 0, item);
      return next;
    });
  };

  const entries = useMemo(
    () => sortRoundEntriesByBib(detail?.entries ?? []),
    [detail?.entries]
  );

  if (!detail) {
    return <p className="py-4 text-sm text-neutral-400">{error ?? "Loading round…"}</p>;
  }

  const { round, judges, heats } = detail;
  const status = round.status;
  const unresolvedCheckin = entries.filter(
    (e) => !e.scratched && e.checkin_status === "pending"
  ).length;
  const presentCount = entries.filter(
    (e) => !e.scratched && e.checkin_status === "checked_in"
  ).length;
  const heatNumber = (heatId: string | null) =>
    heats.find((h) => h.id === heatId)?.heat_number ?? null;

  const btn = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 transition min-h-11";
  const btnPrimary = `${btn} border border-primary bg-primary text-neutral-900 hover:bg-primary/90`;
  const btnGhost = `${btn} border border-neutral-600 text-neutral-200 hover:border-primary/60`;
  const btnDanger = `${btn} border border-red-500/50 text-red-300 hover:bg-red-500/10`;

  return (
    <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900/60 p-4">
      {error && (
        <div className="mb-3 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Actions per state */}
      <div className="mb-4 flex flex-wrap items-center gap-2 max-sm:[&_.round-action-primary]:w-full">
        {status === "pending" && (
          <>
            <div className="flex items-center gap-2 text-sm text-neutral-300">
              <span>Heats:</span>
              <input
                type="number"
                min={1}
                value={heatCount}
                onChange={(e) => setHeatCount(Math.max(1, Number(e.target.value)))}
                className="w-16 rounded-md border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-white"
              />
              <button onClick={randomizeHeats} disabled={busy} className={btnGhost}>
                Randomize heats
              </button>
            </div>
            <button
              onClick={() => transition("checkin")}
              disabled={busy}
              className={`round-action-primary ${btnPrimary}`}
            >
              Begin check-in
            </button>
          </>
        )}
        {status === "checkin" && (
          <>
            <button onClick={() => transition("pending")} disabled={busy} className={btnGhost}>
              Back
            </button>
            {round.source_round_id && (
              <button onClick={promoteAlternate} disabled={busy} className={btnGhost}>
                Promote next alternate
              </button>
            )}
            <button
              onClick={() => transition("open")}
              disabled={busy || unresolvedCheckin > 0}
              className={`round-action-primary ${btnPrimary}`}
              title={
                unresolvedCheckin > 0
                  ? `${unresolvedCheckin} entries still unresolved`
                  : undefined
              }
            >
              Open scoring ({presentCount} dancing)
            </button>
          </>
        )}
        {status === "open" && (
          <>
            <button onClick={() => transition("checkin")} disabled={busy} className={btnGhost}>
              Back to check-in
            </button>
            <button
              onClick={() => transition("closed")}
              disabled={busy}
              className={`round-action-primary ${btnPrimary}`}
            >
              Close scoring
            </button>
          </>
        )}
        {status === "closed" && (
          <>
            <button onClick={() => transition("open")} disabled={busy} className={btnGhost}>
              Reopen scoring
            </button>
            <button
              onClick={() => tabulate()}
              disabled={busy}
              className={`round-action-primary ${btnPrimary}`}
            >
              Tabulate
            </button>
          </>
        )}
        {status === "tabulated" && (
          <>
            <button onClick={removeTabulation} disabled={busy} className={btnDanger}>
              Remove tabulation (step back)
            </button>
            <button
              onClick={() => publish("POST")}
              disabled={busy}
              className={`round-action-primary ${btnPrimary}`}
            >
              Publish results
            </button>
          </>
        )}
        {status === "published" && (
          <button onClick={() => publish("DELETE")} disabled={busy} className={btnDanger}>
            Unpublish
          </button>
        )}
      </div>

      {/* Tie resolution (round verification) */}
      {ties && (
        <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <h4 className="mb-2 font-semibold text-amber-300">
            Coordinator / chief judge decision required
          </h4>
          {ties.map((tie, gi) => (
            <div key={gi} className="mb-3">
              <p className="mb-2 text-sm text-amber-200">{tie.reason}</p>
              <div className="space-y-1">
                {tieOrders[gi]?.map((entryId, i) => {
                  const display = tie.displays.find(
                    (d) => d.roundEntryId === entryId
                  );
                  return (
                    <div
                      key={entryId}
                      className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
                    >
                      <span className="w-6 font-semibold text-primary">{i + 1}.</span>
                      <span className="flex-1 text-white">
                        {display?.bibNumber != null && (
                          <span className="mr-2 font-mono text-neutral-400">
                            #{display.bibNumber}
                          </span>
                        )}
                        {display?.displayName}
                      </span>
                      <button
                        onClick={() => moveInTie(gi, i, i - 1)}
                        disabled={i === 0}
                        className="px-1 text-neutral-400 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveInTie(gi, i, i + 1)}
                        disabled={i === (tieOrders[gi]?.length ?? 0) - 1}
                        className="px-1 text-neutral-400 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => tabulate(tieOrders)}
              disabled={busy}
              className={compBtnPrimary}
            >
              Confirm order &amp; tabulate
            </button>
            <button onClick={() => setTies(null)} className={compBtnSecondary}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Check-in list */}
      {(status === "checkin" || status === "open") && (
        <div className="mb-4">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Check-in ({presentCount} in / {unresolvedCheckin} pending)
          </h4>
          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-2">
            {entries
              .filter((e) => !e.scratched)
              .map((e) => (
                <div
                  key={e.id}
                  className="rounded-md border border-neutral-700 bg-neutral-800/40 px-3 py-2.5"
                >
                  <div className="mb-2 flex min-w-0 items-start gap-2">
                    <span className="shrink-0 font-mono text-sm text-neutral-400">
                      {e.display.bibNumber != null ? `#${e.display.bibNumber}` : "—"}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-white">
                      {e.display.displayName}
                      {e.promoted_alternate && (
                        <span className="ml-1 text-xs text-amber-400">(alt)</span>
                      )}
                      {heatNumber(e.heat_id) != null && (
                        <span className="ml-1 text-xs text-neutral-500">
                          H{heatNumber(e.heat_id)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCheckin(e.id, "checked_in")}
                      className={
                        "flex min-h-11 flex-1 items-center justify-center rounded-md border text-sm font-semibold transition " +
                        (e.checkin_status === "checked_in"
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-neutral-600 text-neutral-300 hover:border-green-500 hover:text-green-400")
                      }
                      aria-label="Checked in"
                    >
                      In
                    </button>
                    <button
                      onClick={() => setCheckin(e.id, "absent")}
                      className={
                        "flex min-h-11 flex-1 items-center justify-center rounded-md border text-sm font-semibold transition " +
                        (e.checkin_status === "absent"
                          ? "border-red-500 bg-red-500 text-white"
                          : "border-neutral-600 text-neutral-300 hover:border-red-500 hover:text-red-400")
                      }
                      aria-label="Absent"
                    >
                      Out
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Judge progress */}
      {["open", "closed"].includes(status) && (
        <div className="mb-4">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Judge progress
          </h4>
          <div className="space-y-1.5">
            {judges.map((j) => (
              <div
                key={j.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800/40 px-3 py-2 text-sm sm:gap-3"
              >
                <span className="flex-1 text-white">
                  {j.first_name} {j.last_name}
                  {j.judge_role === "chief_judge" && (
                    <span className="ml-1 text-xs text-primary">CJ</span>
                  )}
                  {!j.isPanel && (
                    <span className="ml-1 text-xs text-neutral-500">
                      (tie-break only)
                    </span>
                  )}
                </span>
                <span className="text-neutral-400">
                  {j.scored}/{j.total}
                </span>
                {j.sheetStatus === "submitted" ? (
                  <>
                    <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-400">
                      Submitted
                    </span>
                    {status !== "tabulated" && (
                      <button
                        onClick={() => unlockSheet(j.id)}
                        className="text-xs text-neutral-500 hover:text-amber-400"
                      >
                        Unlock
                      </button>
                    )}
                  </>
                ) : (
                  <span className="rounded bg-neutral-700/60 px-2 py-0.5 text-xs text-neutral-300">
                    Scoring…
                  </span>
                )}
                {status === "open" && (
                  <Link
                    href={`/judge/${roundId}?as=${j.id}`}
                    className="text-xs text-neutral-500 hover:text-primary"
                    title="Enter or override scores on this judge's behalf"
                  >
                    Enter for judge
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results grid */}
      {["tabulated", "published"].includes(status) && round.tabulation && (
        <div className="mt-2 overflow-x-auto -mx-4 px-4">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Results
          </h4>
          {round.tabulation.mode === "relative_placement" ? (
            <RelativePlacementGrid tabulation={round.tabulation} />
          ) : (
            <CallbackResultsTable tabulation={round.tabulation} />
          )}
        </div>
      )}
    </div>
  );
}
