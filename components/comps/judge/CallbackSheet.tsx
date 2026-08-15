"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutlineLg, judgeSheetStickyBottom, judgeSheetStickyTop } from "@/lib/comps/buttonStyles";
import HeatSectionDivider from "@/components/comps/judge/HeatSectionDivider";
import JudgeCallbackRow from "@/components/comps/judge/JudgeCallbackRow";
import JudgeConfirmDialog from "@/components/comps/judge/JudgeConfirmDialog";
import JudgeSheetHeader from "@/components/comps/judge/JudgeSheetHeader";
import { useAutosaveQueue } from "@/components/comps/judge/useAutosaveQueue";
import { useScoringOrderMoveFade } from "@/components/comps/judge/useScoringOrderMoveFade";
import { useJudgeShowThumbs } from "@/lib/comps/useJudgeShowThumbs";
import {
  applyCallbackVote,
  applyRawChangeForCallback,
  canSubmitCallbackPlacements,
  conflictedCallbackEntryIds,
  rawScoreForCallback,
  seedRawFromCallbacks,
  type CallbackVote,
} from "@/lib/scoring/callbackRawSync";
import { roundScore, respreadRawScores } from "@/lib/scoring/finalsSync";
import {
  type DisplayOrder,
  sortForDisplayOrder,
} from "@/lib/scoring/displayOrder";

const SHOW_SPREAD_SCORES_UI = false;

interface SheetEntry {
  roundEntryId: string;
  bibNumber: number | null;
  displayName: string;
  heatNumber: number | null;
}

interface ThumbsState {
  up: number;
  down: number;
}

export default function CallbackSheet({
  roundId,
  judgeAssignmentId,
  isOverride,
  callbackCount,
  alternateCount,
  entries,
  initialScores,
  sheetStatus,
  onSubmitted,
  stickyHeaderExtra,
}: {
  roundId: string;
  judgeAssignmentId: string;
  isOverride: boolean;
  callbackCount: number;
  alternateCount: number;
  entries: SheetEntry[];
  initialScores: {
    round_entry_id: string;
    callback_value: string | null;
    raw_score?: number | null;
    thumbs_up_count?: number;
    thumbs_down_count?: number;
  }[];
  sheetStatus: "draft" | "submitted";
  onSubmitted: () => void;
  stickyHeaderExtra?: ReactNode;
}) {
  const entryIds = useMemo(
    () => entries.map((e) => e.roundEntryId),
    [entries]
  );

  const [votes, setVotes] = useState<Map<string, CallbackVote>>(() => {
    const map = new Map<string, CallbackVote>();
    for (const s of initialScores) {
      if (s.callback_value) map.set(s.round_entry_id, s.callback_value as CallbackVote);
    }
    return map;
  });
  const [rawById, setRawById] = useState<Map<string, number | null>>(() =>
    buildInitialRaw(entryIds, initialScores, votes)
  );
  const [thumbs, setThumbs] = useState<Map<string, ThumbsState>>(() =>
    buildInitialThumbs(initialScores)
  );
  const [displayOrder, setDisplayOrder] = useState<DisplayOrder>("bib");
  const [mode, setMode] = useState<"placement" | "raw">("placement");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sliderDraft, setSliderDraft] = useState<Map<string, number>>(new Map());
  const [spreadConfirmOpen, setSpreadConfirmOpen] = useState(false);
  const { showThumbs, setShowThumbs } = useJudgeShowThumbs();
  const locked = sheetStatus === "submitted";

  const votesRef = useRef(votes);
  const rawByIdRef = useRef(rawById);
  const thumbsRef = useRef(thumbs);
  votesRef.current = votes;
  rawByIdRef.current = rawById;
  thumbsRef.current = thumbs;

  const autosave = useAutosaveQueue({
    roundId,
    judgeAssignmentId,
    sendAssignmentId: isOverride,
  });

  const effectiveCallbacks = Math.min(callbackCount, entries.length);
  const effectiveAlternates = Math.min(
    alternateCount,
    Math.max(0, entries.length - effectiveCallbacks)
  );
  const limits = useMemo(
    () => ({
      callbackCount: effectiveCallbacks,
      alternateCount: effectiveAlternates,
    }),
    [effectiveCallbacks, effectiveAlternates]
  );
  const limitsRef = useRef(limits);
  limitsRef.current = limits;

  const altOptions = useMemo(
    () =>
      (["alt1", "alt2", "alt3"] as CallbackVote[]).slice(0, effectiveAlternates),
    [effectiveAlternates]
  );

  const displayRows = useMemo(() => {
    const rows = entries.map((e) => ({
      entry: e,
      entryId: e.roundEntryId,
      bibNumber: e.bibNumber,
      danceOrder: null as number | null,
      raw: rawById.get(e.roundEntryId) ?? null,
    }));
    return sortForDisplayOrder(rows, displayOrder);
  }, [entries, rawById, displayOrder]);

  const { rows: visibleDisplayRows, isFading: isReorderFading } =
    useScoringOrderMoveFade(displayRows, displayOrder);

  const heatSections = useMemo(() => {
    if (displayOrder !== "bib") {
      return [[null, visibleDisplayRows] as const];
    }
    const map = new Map<number | null, typeof visibleDisplayRows>();
    for (const row of visibleDisplayRows) {
      const key = row.entry.heatNumber;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  }, [visibleDisplayRows, displayOrder]);

  useEffect(() => {
    const restored = autosave.restoreUnsent();
    if (restored.length > 0 && !locked) {
      setVotes((prev) => {
        const next = new Map(prev);
        for (const patch of restored) {
          if (patch.callback_value !== undefined) {
            next.set(
              patch.round_entry_id,
              (patch.callback_value ?? "no") as CallbackVote
            );
          }
        }
        return next;
      });
      setRawById((prev) => {
        const next = new Map(prev);
        for (const patch of restored) {
          if (patch.raw_score !== undefined) {
            next.set(
              patch.round_entry_id,
              patch.raw_score != null ? Number(patch.raw_score) : null
            );
          }
        }
        return next;
      });
      setThumbs((prev) => {
        const next = new Map(prev);
        for (const patch of restored) {
          if (
            patch.thumbs_up_count !== undefined ||
            patch.thumbs_down_count !== undefined
          ) {
            const existing = next.get(patch.round_entry_id) ?? { up: 0, down: 0 };
            next.set(patch.round_entry_id, {
              up: patch.thumbs_up_count ?? existing.up,
              down: patch.thumbs_down_count ?? existing.down,
            });
          }
        }
        return next;
      });
      setNotice("Draft restored from this device");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queueScorePatches = useCallback(
    (
      nextVotes: Map<string, CallbackVote>,
      nextRaw: Map<string, number | null>,
      changedIds: string[]
    ) => {
      const patches = changedIds.map((id) => ({
        round_entry_id: id,
        callback_value: nextVotes.get(id) ?? "no",
        raw_score: nextRaw.get(id) ?? null,
      }));
      const scored = entryIds.filter((id) => nextVotes.has(id)).length;
      autosave.queue(patches, { scored, total: entries.length });
    },
    [autosave, entryIds, entries.length]
  );

  const applyVoteAndRaw = useCallback(
    (
      nextVotes: Map<string, CallbackVote>,
      nextRaw: Map<string, number | null>,
      changedIds: string[]
    ) => {
      setVotes(nextVotes);
      setRawById(nextRaw);
      setError(null);
      queueScorePatches(nextVotes, nextRaw, changedIds);
    },
    [queueScorePatches]
  );

  const setVote = useCallback(
    (roundEntryId: string, vote: CallbackVote) => {
      if (locked) return;
      const currentVotes = votesRef.current;
      if (currentVotes.get(roundEntryId) === vote) return;

      const result = applyCallbackVote(
        entryIds,
        currentVotes,
        rawByIdRef.current,
        roundEntryId,
        vote,
        limitsRef.current
      );

      const changed = new Set<string>([roundEntryId]);
      for (const [id, v] of result.votes) {
        if (currentVotes.get(id) !== v) changed.add(id);
      }
      applyVoteAndRaw(result.votes, result.rawById, [...changed]);
    },
    [locked, entryIds, applyVoteAndRaw]
  );

  const commitRaw = useCallback(
    (entryId: string, value: number) => {
      if (locked) return;
      const currentVotes = votesRef.current;
      const result = applyRawChangeForCallback(
        entryIds,
        currentVotes,
        rawByIdRef.current,
        entryId,
        value,
        limitsRef.current
      );
      const changed = new Set<string>([entryId]);
      for (const id of entryIds) {
        if (currentVotes.get(id) !== result.votes.get(id)) changed.add(id);
      }
      applyVoteAndRaw(result.votes, result.rawById, [...changed]);
      setSliderDraft((prev) => {
        const next = new Map(prev);
        next.delete(entryId);
        return next;
      });
    },
    [locked, entryIds, applyVoteAndRaw]
  );

  const nudgeRaw = useCallback(
    (entryId: string, delta: number) => {
      if (locked) return;
      const currentVotes = votesRef.current;
      const currentRaw = rawByIdRef.current;
      const current =
        currentRaw.get(entryId) ??
        rawScoreForCallback(currentVotes.get(entryId) ?? "no");
      commitRaw(entryId, roundScore(current + delta));
    },
    [locked, commitRaw]
  );

  const applySpread = () => {
    const order = sortForDisplayOrder(
      entries.map((e) => ({
        entryId: e.roundEntryId,
        bibNumber: e.bibNumber,
        danceOrder: null as number | null,
        raw: rawById.get(e.roundEntryId) ?? null,
      })),
      "score"
    ).map((r) => r.entryId);
    const nextRaw = respreadRawScores(order, rawById, { floor: 20 });
    const changedIds = entryIds.filter(
      (id) => nextRaw.get(id) !== rawById.get(id)
    );
    setRawById(nextRaw);
    setSpreadConfirmOpen(false);
    setSliderDraft(new Map());
    if (changedIds.length > 0) {
      autosave.queue(
        changedIds.map((id) => ({
          round_entry_id: id,
          raw_score: nextRaw.get(id) ?? null,
        }))
      );
    }
  };

  const handleModeChange = (nextMode: "placement" | "raw") => {
    if (nextMode === "raw") {
      setRawById((prev) => {
        const next = new Map(prev);
        const seeded = seedRawFromCallbacks(entryIds, votes);
        for (const id of entryIds) {
          if (next.get(id) == null) {
            next.set(id, seeded.get(id) ?? rawScoreForCallback("no"));
          }
        }
        return next;
      });
    }
    setMode(nextMode);
  };

  const saveThumbs = useCallback(
    (entryId: string, patch: Partial<ThumbsState>) => {
      setThumbs((prev) => {
        const next = new Map(prev);
        const existing = next.get(entryId) ?? { up: 0, down: 0 };
        const merged = { ...existing, ...patch };
        next.set(entryId, merged);
        autosave.queue([
          {
            round_entry_id: entryId,
            thumbs_up_count: merged.up,
            thumbs_down_count: merged.down,
          },
        ]);
        return next;
      });
    },
    [autosave]
  );

  const handleThumbsUp = useCallback(
    (entryId: string) => {
      saveThumbs(entryId, { up: (thumbsRef.current.get(entryId)?.up ?? 0) + 1 });
    },
    [saveThumbs]
  );

  const handleThumbsDown = useCallback(
    (entryId: string) => {
      saveThumbs(entryId, {
        down: (thumbsRef.current.get(entryId)?.down ?? 0) + 1,
      });
    },
    [saveThumbs]
  );

  const handleSliderDraft = useCallback((entryId: string, value: number) => {
    setSliderDraft((prev) => {
      const next = new Map(prev);
      next.set(entryId, value);
      return next;
    });
  }, []);

  const yesCount = [...votes.values()].filter((v) => v === "yes").length;
  const unknownCount = entries.filter(
    (e) => votes.get(e.roundEntryId) == null
  ).length;
  const altAssigned = (rank: CallbackVote) =>
    [...votes.values()].some((v) => v === rank);
  const conflictedIds = useMemo(
    () => new Set(conflictedCallbackEntryIds(votes, limits)),
    [votes, limits]
  );
  const hasTies = conflictedIds.size > 0;
  const canSubmit = canSubmitCallbackPlacements(votes, limits, entryIds);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    await autosave.flushNow();
    const res = await authedFetch(`/api/judge/rounds/${roundId}/scores`, {
      method: "POST",
      body: JSON.stringify(
        isOverride ? { judge_assignment_id: judgeAssignmentId } : {}
      ),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    autosave.clearDraft();
    onSubmitted();
  };

  const thumbsToggle =
    mode === "raw" ? (
      <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
        <input
          type="checkbox"
          checked={showThumbs}
          onChange={(e) => setShowThumbs(e.target.checked)}
          className="rounded border-neutral-600"
        />
        Thumbs
      </label>
    ) : null;

  const summary = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span
        className={
          yesCount === effectiveCallbacks && !hasTies
            ? "font-semibold text-primary"
            : yesCount > effectiveCallbacks
              ? "font-semibold text-blue-400"
              : "text-neutral-300"
        }
      >
        Yes: {yesCount}/{effectiveCallbacks}
      </span>
      <span className="text-neutral-300">Unknown: {unknownCount}</span>
      {altOptions.length > 0 && (
        <span className="text-neutral-300">
          Alts:{" "}
          {altOptions.map((rank) => (
            <span
              key={rank}
              className={
                "ml-1 " +
                (altAssigned(rank) ? "text-amber-400" : "text-neutral-600")
              }
            >
              {rank.toUpperCase()}
            </span>
          ))}
        </span>
      )}
    </div>
  );

  return (
    <div>
      <div className={judgeSheetStickyTop}>
        <JudgeSheetHeader
          stickyHeaderExtra={stickyHeaderExtra}
          displayOrder={displayOrder}
          onDisplayOrderChange={setDisplayOrder}
          mode={mode}
          onModeChange={handleModeChange}
          saveState={autosave.saveState}
          extraSummary={summary}
          headerControls={thumbsToggle}
        />
      </div>

      {notice && (
        <div className="mb-3 rounded-md border border-blue-500/40 bg-blue-500/10 p-2 text-sm text-blue-300">
          {notice}
        </div>
      )}
      {(error || autosave.lockedMessage) && (
        <div className="mb-3 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-300">
          {autosave.lockedMessage ?? error}
        </div>
      )}
      {locked && (
        <div className="mb-3 rounded-md border border-green-500/40 bg-green-500/10 p-2 text-sm text-green-300">
          Sheet submitted and locked. Ask the chief judge to unlock it if a
          change is needed.
        </div>
      )}
      {hasTies && !locked && (
        <p className="mb-2 text-xs text-blue-400">
          Tied votes — adjust before submitting.
        </p>
      )}
      {mode === "raw" && !locked && (
        <p className="mb-2 text-xs text-neutral-500">
          Yes and alternates update from score order (top {effectiveCallbacks}{" "}
          Yes
          {effectiveAlternates > 0
            ? `, next ${effectiveAlternates} alternate${effectiveAlternates === 1 ? "" : "s"}`
            : ""}
          ).
        </p>
      )}
      {SHOW_SPREAD_SCORES_UI && mode === "raw" && !locked && (
        <button
          type="button"
          onClick={() => setSpreadConfirmOpen(true)}
          disabled={[...rawById.values()].filter((r) => r != null).length === 0}
          className="mb-3 min-h-11 rounded-md border border-neutral-600 px-3 py-2 text-sm text-neutral-300"
        >
          Spread scores evenly
        </button>
      )}

      <JudgeConfirmDialog
        open={spreadConfirmOpen}
        title="Spread scores evenly?"
        message="Spread assigned raw scores evenly from 100 to 20 by current rank? Unscored competitors stay unscored. Placement and callback votes will not change."
        confirmLabel="Spread scores"
        onConfirm={applySpread}
        onCancel={() => setSpreadConfirmOpen(false)}
      />

      {heatSections.map(([heatNumber, rows]) => (
        <div key={heatNumber ?? "all"} className="mb-4">
          {heatNumber != null && displayOrder === "bib" && (
            <HeatSectionDivider
              heatNumber={heatNumber}
              entryCount={rows.length}
            />
          )}
          <div className="space-y-1">
            {rows.map(({ entry: e }) => {
              const vote = votes.get(e.roundEntryId);
              const raw = rawById.get(e.roundEntryId) ?? null;
              const thumbState = thumbs.get(e.roundEntryId) ?? { up: 0, down: 0 };
              const isConflicted = conflictedIds.has(e.roundEntryId);

              return (
                <JudgeCallbackRow
                  key={e.roundEntryId}
                  entry={e}
                  mode={mode}
                  vote={vote}
                  raw={raw}
                  isConflicted={isConflicted}
                  rowTone={callbackRowTone(vote, isConflicted)}
                  locked={locked}
                  showThumbs={showThumbs}
                  thumbUp={thumbState.up}
                  thumbDown={thumbState.down}
                  sliderDraftValue={sliderDraft.get(e.roundEntryId)}
                  altOptions={altOptions}
                  onSetVote={setVote}
                  onSliderDraft={handleSliderDraft}
                  onSliderCommit={commitRaw}
                  onNudgeRaw={nudgeRaw}
                  onThumbsUp={handleThumbsUp}
                  onThumbsDown={handleThumbsDown}
                  reorderFading={isReorderFading(e.roundEntryId)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {!locked && (
        <div className={judgeSheetStickyBottom}>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || submitting}
            className={compBtnOutlineLg}
          >
            {submitting
              ? "Submitting…"
              : canSubmit
                ? "Submit sheet"
                : unknownCount > 0
                  ? `Mark ${unknownCount} unknown${unknownCount === 1 ? "" : "s"} to submit`
                  : hasTies
                    ? "Resolve tied votes to submit"
                    : yesCount !== effectiveCallbacks
                      ? `Select ${effectiveCallbacks - yesCount} more Yes`
                      : "Assign all alternate ranks to submit"}
          </button>
        </div>
      )}
    </div>
  );
}

function callbackRowTone(
  vote: CallbackVote | undefined,
  isConflicted: boolean
): string {
  if (isConflicted) return "border-blue-500/70 bg-blue-500/10";
  if (vote === "yes") return "border-green-500/60 bg-green-500/10";
  if (vote === "no") return "border-red-500/60 bg-red-500/10";
  if (vote?.startsWith("alt")) return "border-amber-500/60 bg-amber-500/10";
  return "border-neutral-700 bg-neutral-800/50";
}

function buildInitialRaw(
  entryIds: string[],
  initialScores: {
    round_entry_id: string;
    callback_value: string | null;
    raw_score?: number | null;
  }[],
  votes: Map<string, CallbackVote>
): Map<string, number | null> {
  const scoreById = new Map(initialScores.map((s) => [s.round_entry_id, s]));
  const map = new Map<string, number | null>();
  for (const id of entryIds) {
    const saved = scoreById.get(id)?.raw_score;
    if (saved != null) {
      map.set(id, Number(saved));
    } else if (votes.has(id)) {
      map.set(id, rawScoreForCallback(votes.get(id)!));
    } else {
      map.set(id, null);
    }
  }
  return map;
}

function buildInitialThumbs(
  initialScores: {
    round_entry_id: string;
    thumbs_up_count?: number;
    thumbs_down_count?: number;
  }[]
): Map<string, ThumbsState> {
  const map = new Map<string, ThumbsState>();
  for (const s of initialScores) {
    map.set(s.round_entry_id, {
      up: s.thumbs_up_count ?? 0,
      down: s.thumbs_down_count ?? 0,
    });
  }
  return map;
}
