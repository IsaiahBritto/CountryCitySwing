"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import {
  compBtnOutline,
  compBtnSecondary,
} from "@/lib/comps/buttonStyles";
import { sortRoundEntriesByBib } from "@/lib/comps/entrySort";
import { lookupPlaybookEntry } from "@/lib/comps/scoringTest/playbook";
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
  competition: { id: string; name: string; comp_type: string };
  finalsMeta: {
    rotation_offset: number | null;
    pairings_confirmed_at: string | null;
    prePairing: boolean;
  } | null;
  heats: { id: string; heat_number: number }[];
  results: any[];
  entries: {
    id: string;
    heat_id: string | null;
    dance_order: number | null;
    checkin_status: "pending" | "checked_in" | "absent";
    checkin_role: "lead" | "follow" | null;
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
  testComp,
  onChanged,
}: {
  roundId: string;
  testComp?: boolean;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<RoundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoFillMsg, setAutoFillMsg] = useState<string | null>(null);
  const [heatCount, setHeatCount] = useState(1);
  const [ties, setTies] = useState<UnresolvedTie[] | null>(null);
  const [tieOrders, setTieOrders] = useState<string[][]>([]);
  const [previewTabulation, setPreviewTabulation] = useState<any>(null);
  const [tieCallbacks, setTieCallbacks] = useState<number>(0);
  const [tieAlternates, setTieAlternates] = useState<number>(0);
  const [rotationInput, setRotationInput] = useState("");
  const [pairPreview, setPairPreview] = useState<
    { leadBib: number | null; followBib: number | null }[]
  >([]);
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

  useEffect(() => {
    const offset = detail?.finalsMeta?.rotation_offset;
    if (offset != null) {
      setRotationInput(String(offset));
    }
    if (
      detail?.finalsMeta?.prePairing &&
      detail.finalsMeta.rotation_offset != null
    ) {
      (async () => {
        const res = await authedFetch(
          `/api/admin/comps/rounds/${roundId}/pairings`
        );
        if (res.ok) {
          const data = await res.json();
          setPairPreview(data.preview ?? []);
        }
      })();
    } else if (!detail?.finalsMeta?.prePairing) {
      setPairPreview([]);
    }
  }, [detail?.finalsMeta, roundId]);

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

  const transition = async (status: string) => {
    setBusy(true);
    setError(null);
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return false;
    }
    const body = await res.json();
    if (body.autoFill?.autoFilled) {
      setAutoFillMsg(
        `Test scores auto-filled for ${body.autoFill.judgeCount} judge${body.autoFill.judgeCount === 1 ? "" : "s"}.`
      );
    }
    await load();
    onChanged();
    return true;
  };

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

  const submitRotation = async () => {
    setBusy(true);
    setError(null);
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}/pairings`, {
      method: "POST",
      body: JSON.stringify({ rotation_offset: Number(rotationInput) }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setPairPreview(data.preview ?? []);
    await load();
    onChanged();
  };

  const generateRandomRotation = async () => {
    setBusy(true);
    setError(null);
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}/pairings`, {
      method: "POST",
      body: JSON.stringify({ action: "random" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    if (data.rotation_offset != null) {
      setRotationInput(String(data.rotation_offset));
    }
  };

  const confirmPairings = () =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}/pairings/confirm`, {
        method: "POST",
      })
    );

  const randomizeHeats = () =>
    act(() =>
      authedFetch(`/api/admin/comps/rounds/${roundId}/heats`, {
        method: "POST",
        body: JSON.stringify({ heat_count: heatCount }),
      })
    );

  const tabulate = async (
    resolutions: string[][] = [],
    options?: { callbackCount?: number; alternateCount?: number; previewOnly?: boolean }
  ) => {
    setBusy(true);
    setError(null);
    if (!options?.previewOnly) {
      setTies(null);
      setPreviewTabulation(null);
    }
    const payload: Record<string, unknown> = {
      manual_tie_resolutions: resolutions,
    };
    const cb = options?.callbackCount ?? tieCallbacks;
    const alt = options?.alternateCount ?? tieAlternates;
    const scoringMode = detailRef.current?.round.scoring_mode;
    if (scoringMode === "callback" && cb > 0) {
      payload.callback_count = cb;
      payload.alternate_count = alt;
    }
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}/tabulate`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (body.unresolvedTies) {
        setTies(body.unresolvedTies);
        setTieOrders(
          resolutions.length > 0
            ? resolutions
            : body.unresolvedTies.map((t: UnresolvedTie) => t.roundEntryIds)
        );
        if (body.previewTabulation) {
          setPreviewTabulation(body.previewTabulation);
          if (body.previewTabulation.mode === "callback") {
            setTieCallbacks(body.previewTabulation.callbackCount);
            setTieAlternates(body.previewTabulation.alternateCount);
          }
        } else if (detailRef.current?.round) {
          setTieCallbacks(detailRef.current.round.callback_count ?? 0);
          setTieAlternates(detailRef.current.round.alternate_count ?? 0);
        }
        return;
      }
      setError(body.error ?? "Tabulation blocked");
      return;
    }
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setTies(null);
    setPreviewTabulation(null);
    await load();
    onChanged();
  };

  const refreshTiePreview = () => {
    if (!ties) return;
    tabulate([], { previewOnly: true });
  };

  const cancelTieResolution = () => {
    setTies(null);
    setPreviewTabulation(null);
  };

  const tiedEntryIds = useMemo(() => {
    if (!ties) return new Set<string>();
    const ids = new Set<string>();
    for (const tie of ties) {
      for (const id of tie.roundEntryIds) ids.add(id);
    }
    return ids;
  }, [ties]);

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

  const { round, judges, heats, finalsMeta, competition } = detail;
  const status = round.status;
  const isJnJFinalsPrePairing =
    competition.comp_type === "jack_and_jill" &&
    round.round_type === "final" &&
    finalsMeta?.prePairing === true;

  const activeEntries = entries.filter((e) => !e.scratched);
  const leadEntries = isJnJFinalsPrePairing
    ? activeEntries.filter((e) => e.checkin_role === "lead")
    : [];
  const followEntries = isJnJFinalsPrePairing
    ? activeEntries.filter((e) => e.checkin_role === "follow")
    : [];

  const unresolvedCheckin = activeEntries.filter(
    (e) => e.checkin_status === "pending"
  ).length;
  const presentCount = activeEntries.filter(
    (e) => e.checkin_status === "checked_in"
  ).length;

  const leadUnresolved = leadEntries.filter(
    (e) => e.checkin_status === "pending"
  ).length;
  const followUnresolved = followEntries.filter(
    (e) => e.checkin_status === "pending"
  ).length;
  const leadPresent = leadEntries.filter(
    (e) => e.checkin_status === "checked_in"
  ).length;
  const followPresent = followEntries.filter(
    (e) => e.checkin_status === "checked_in"
  ).length;
  const rotationReady =
    isJnJFinalsPrePairing &&
    leadUnresolved === 0 &&
    followUnresolved === 0 &&
    leadPresent > 0 &&
    followPresent > 0 &&
    leadPresent === followPresent;
  const pairingsConfirmed = finalsMeta?.pairings_confirmed_at != null;
  const rotationMax = Math.max(0, leadPresent - 1);
  const heatNumber = (heatId: string | null) =>
    heats.find((h) => h.id === heatId)?.heat_number ?? null;

  const renderCheckinRow = (e: (typeof entries)[0]) => (
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
  );

  const btnDanger =
    "inline-flex min-h-11 items-center justify-center rounded-md border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50";

  const playbook =
    testComp && round
      ? lookupPlaybookEntry(
          competition.comp_type as "strictly" | "jack_and_jill",
          round.round_type as "prelims" | "quarterfinal" | "semifinal" | "final",
          (round.judged_role as "lead" | "follow" | null) ?? null
        )
      : null;

  return (
    <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900/60 p-4">
      {testComp && playbook && (
        <div className="mb-3 rounded-md border border-violet-500/40 bg-violet-500/10 p-3 text-sm text-violet-200">
          <p className="font-semibold text-violet-300">
            Test scenario: {playbook.label}
          </p>
          <p className="mt-1 text-violet-200/90">{playbook.description}</p>
        </div>
      )}
      {autoFillMsg && (
        <div className="mb-3 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">
          {autoFillMsg}
        </div>
      )}
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
              <button onClick={randomizeHeats} disabled={busy} className={compBtnSecondary}>
                Randomize heats
              </button>
            </div>
            <button
              onClick={() => transition("checkin")}
              disabled={busy}
              className={`round-action-primary ${compBtnOutline}`}
            >
              Begin check-in
            </button>
          </>
        )}
        {status === "checkin" && (
          <>
            <button onClick={() => transition("pending")} disabled={busy} className={compBtnSecondary}>
              Back
            </button>
            {round.source_round_id && (
              <button onClick={promoteAlternate} disabled={busy} className={compBtnSecondary}>
                Promote next alternate
              </button>
            )}
            <button
              onClick={() => transition("open")}
              disabled={
                busy ||
                unresolvedCheckin > 0 ||
                (isJnJFinalsPrePairing && !pairingsConfirmed)
              }
              className={`round-action-primary ${compBtnOutline}`}
              title={
                isJnJFinalsPrePairing && !pairingsConfirmed
                  ? "Confirm rotation pairings before opening scoring"
                  : unresolvedCheckin > 0
                    ? `${unresolvedCheckin} entries still unresolved`
                    : undefined
              }
            >
              Open scoring ({presentCount} dancing)
            </button>
            {isJnJFinalsPrePairing && pairingsConfirmed && (
              <span className="text-xs text-primary">Pairings confirmed</span>
            )}
          </>
        )}
        {status === "open" && (
          <>
            <button onClick={() => transition("checkin")} disabled={busy} className={compBtnSecondary}>
              Back to check-in
            </button>
            <button
              onClick={() => transition("closed")}
              disabled={busy}
              className={`round-action-primary ${compBtnOutline}`}
            >
              Close scoring
            </button>
          </>
        )}
        {status === "closed" && (
          <>
            <button onClick={() => transition("open")} disabled={busy} className={compBtnSecondary}>
              Reopen scoring
            </button>
            <button
              onClick={() => tabulate()}
              disabled={busy}
              className={`round-action-primary ${compBtnOutline}`}
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
              className={`round-action-primary ${compBtnOutline}`}
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
        <div className="mb-4 space-y-4">
          {previewTabulation && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-4">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Full scoring
              </h4>
              {previewTabulation.mode === "relative_placement" ? (
                <RelativePlacementGrid
                  tabulation={previewTabulation}
                  highlightEntryIds={tiedEntryIds}
                />
              ) : (
                <CallbackResultsTable
                  tabulation={previewTabulation}
                  highlightEntryIds={tiedEntryIds}
                />
              )}
            </div>
          )}

          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <h4 className="mb-2 font-semibold text-amber-300">
              Coordinator / chief judge decision required
            </h4>
            {previewTabulation?.mode === "callback" && (
              <p className="mb-3 text-sm text-amber-200/90">
                Panel scores are tied at a cut line. The chief judge&apos;s votes
                were checked but could not break this tie (missing sheet, identical
                votes, or still tied after CJ ordering). Set the final order below.
              </p>
            )}
            {previewTabulation?.mode === "callback" && (
              <div className="mb-4 rounded-md border border-neutral-700 bg-neutral-900/50 p-3">
                <p className="mb-2 text-xs text-neutral-400">
                  Adjust call back or alternates if you need to advance more or
                  fewer competitors than configured. Changes persist when you
                  confirm tabulate.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 text-sm text-neutral-300">
                    Call back
                    <input
                      type="number"
                      min={1}
                      value={tieCallbacks}
                      onChange={(e) => setTieCallbacks(Number(e.target.value))}
                      className="w-20 rounded-md border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-white"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-300">
                    Alternates
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={tieAlternates}
                      onChange={(e) => setTieAlternates(Number(e.target.value))}
                      className="w-20 rounded-md border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-white"
                    />
                  </label>
                  <button
                    onClick={refreshTiePreview}
                    disabled={busy}
                    className={compBtnSecondary + " text-sm"}
                  >
                    Update preview
                  </button>
                </div>
              </div>
            )}
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
                        <span className="w-6 font-semibold text-primary">
                          {i + 1}.
                        </span>
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
                className={compBtnOutline}
              >
                Confirm order &amp; tabulate
              </button>
              <button onClick={cancelTieResolution} className={compBtnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check-in list */}
      {(status === "checkin" || status === "open") && (
        <div className="mb-4">
          {isJnJFinalsPrePairing ? (
            <>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Finals check-in — leads ({leadPresent} in / {leadUnresolved}{" "}
                pending)
              </h4>
              <div className="mb-4 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-2">
                {leadEntries.map(renderCheckinRow)}
              </div>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Finals check-in — follows ({followPresent} in /{" "}
                {followUnresolved} pending)
              </h4>
              <div className="mb-4 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-2">
                {followEntries.map(renderCheckinRow)}
              </div>

              {rotationReady && (
                <div className="rounded-xl border border-primary/40 bg-neutral-800/60 p-4">
                  <h4 className="mb-2 font-semibold text-white">
                    Rotation pairing
                  </h4>
                  <p className="mb-3 text-sm text-neutral-400">
                    Enter a rotation from 1 to {rotationMax}. Lead bib order
                    pairs with follows shifted by that amount.
                  </p>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={rotationMax || 1}
                      value={rotationInput}
                      onChange={(e) => setRotationInput(e.target.value)}
                      className="w-20 rounded-md border border-neutral-600 bg-neutral-900 px-2 py-2 text-sm text-white"
                    />
                    <button
                      onClick={generateRandomRotation}
                      disabled={busy || rotationMax < 1}
                      className={compBtnSecondary}
                    >
                      Generate random
                    </button>
                    <button
                      onClick={submitRotation}
                      disabled={busy || !rotationInput || rotationMax < 1}
                      className={compBtnOutline}
                    >
                      Submit rotation
                    </button>
                    {finalsMeta?.rotation_offset != null && !pairingsConfirmed && (
                      <button
                        onClick={confirmPairings}
                        disabled={busy}
                        className={compBtnOutline}
                      >
                        Confirm pairings
                      </button>
                    )}
                  </div>
                  {pairPreview.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-neutral-500">
                            <th className="pb-2 pr-4">Lead bib</th>
                            <th className="pb-2">Follow bib</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pairPreview.map((p, i) => (
                            <tr key={i} className="border-t border-neutral-800">
                              <td className="py-1.5 font-mono text-white">
                                #{p.leadBib ?? "—"}
                              </td>
                              <td className="py-1.5 font-mono text-neutral-300">
                                #{p.followBib ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Check-in ({presentCount} in / {unresolvedCheckin} pending)
              </h4>
              <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-2">
                {activeEntries.map(renderCheckinRow)}
              </div>
            </>
          )}
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
