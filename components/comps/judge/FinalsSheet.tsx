"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutlineLg, judgeSheetStickyTop } from "@/lib/comps/buttonStyles";
import HeatSectionDivider from "@/components/comps/judge/HeatSectionDivider";
import JudgeConfirmDialog from "@/components/comps/judge/JudgeConfirmDialog";
import JudgeFinalsRow from "@/components/comps/judge/JudgeFinalsRow";
import JudgeSheetHeader from "@/components/comps/judge/JudgeSheetHeader";
import FinalsVerifyPlacementsModal from "@/components/comps/judge/FinalsVerifyPlacementsModal";
import { useAutosaveQueue } from "@/components/comps/judge/useAutosaveQueue";
import { useScoringOrderMoveFade } from "@/components/comps/judge/useScoringOrderMoveFade";
import { useJudgeShowThumbs } from "@/lib/comps/useJudgeShowThumbs";
import {
  applyRawChange,
  canOpenVerify,
  clampScore,
  finalizeAllRankings,
  partialOrdinalsFromItems,
  roundScore,
  respreadRawScores,
  rankedEntryIds,
  tiedEntryIds,
  type FinalsScoreItem,
} from "@/lib/scoring/finalsSync";
import {
  type DisplayOrder,
  sortForDisplayOrder,
} from "@/lib/scoring/displayOrder";

const SHOW_SPREAD_SCORES_UI = false;

interface SheetEntry {
  roundEntryId: string;
  bibNumber: number | null;
  displayName: string;
  leadDisplayName?: string | null;
  followBibNumber?: number | null;
  followDisplayName?: string | null;
  heatNumber?: number | null;
}

interface ThumbsState {
  up: number;
  down: number;
}

export default function FinalsSheet({
  roundId,
  judgeAssignmentId,
  isOverride,
  entries,
  initialScores,
  sheetStatus,
  onSubmitted,
  stickyHeaderExtra,
}: {
  roundId: string;
  judgeAssignmentId: string;
  isOverride: boolean;
  entries: SheetEntry[];
  initialScores: {
    round_entry_id: string;
    ordinal: number | null;
    raw_score: number | null;
    thumbs_up_count?: number;
    thumbs_down_count?: number;
  }[];
  sheetStatus: "draft" | "submitted";
  onSubmitted: () => void;
  stickyHeaderExtra?: ReactNode;
}) {
  const entryById = useMemo(
    () => new Map(entries.map((e) => [e.roundEntryId, e])),
    [entries]
  );

  const [items, setItems] = useState<FinalsScoreItem[]>(() =>
    buildInitialItems(entries, initialScores)
  );
  const [thumbs, setThumbs] = useState<Map<string, ThumbsState>>(() =>
    buildInitialThumbs(initialScores)
  );
  const [displayOrder, setDisplayOrder] = useState<DisplayOrder>("bib");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [sliderDraft, setSliderDraft] = useState<Map<string, number>>(new Map());
  const [spreadConfirmOpen, setSpreadConfirmOpen] = useState(false);
  const { showThumbs, setShowThumbs } = useJudgeShowThumbs();
  const locked = sheetStatus === "submitted";

  const itemsRef = useRef(items);
  const thumbsRef = useRef(thumbs);
  itemsRef.current = items;
  thumbsRef.current = thumbs;

  const autosave = useAutosaveQueue({
    roundId,
    judgeAssignmentId,
    sendAssignmentId: isOverride,
  });

  const displayRows = useMemo(() => {
    const enriched = items.map((item) => ({
      item,
      bibNumber: entryById.get(item.entryId)?.bibNumber ?? null,
      danceOrder: null as number | null,
      raw: item.raw,
      ordinal: item.ordinal,
      entryId: item.entryId,
    }));
    return sortForDisplayOrder(enriched, displayOrder, "raw");
  }, [items, entryById, displayOrder]);

  const { rows: visibleDisplayRows, isFading: isReorderFading } =
    useScoringOrderMoveFade(displayRows, displayOrder);

  const heatSections = useMemo(() => {
    if (displayOrder !== "bib") {
      return [[null, visibleDisplayRows] as const];
    }
    const hasHeat = visibleDisplayRows.some(
      (r) => entryById.get(r.entryId)?.heatNumber != null
    );
    if (!hasHeat) {
      return [[null, visibleDisplayRows] as const];
    }
    const map = new Map<number | null, typeof visibleDisplayRows>();
    for (const row of visibleDisplayRows) {
      const heatNumber = entryById.get(row.entryId)?.heatNumber ?? null;
      map.set(heatNumber, [...(map.get(heatNumber) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  }, [visibleDisplayRows, displayOrder, entryById]);

  useEffect(() => {
    const restored = autosave.restoreUnsent();
    if (restored.length > 0 && !locked) {
      setItems((prev) => {
        const patched = prev.map((i) => ({ ...i }));
        for (const patch of restored) {
          const target = patched.find((p) => p.entryId === patch.round_entry_id);
          if (!target) continue;
          if (patch.ordinal !== undefined) {
            target.ordinal =
              patch.ordinal != null && patch.ordinal > 0 ? patch.ordinal : null;
          }
          if (typeof patch.raw_score === "number") {
            target.raw = clampScore(patch.raw_score);
          }
        }
        return patched;
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

  const saveAll = useCallback(
    (next: FinalsScoreItem[]) => {
      autosave.queue(
        next.map((item) => ({
          round_entry_id: item.entryId,
          ordinal: item.ordinal,
          ...(item.raw != null ? { raw_score: item.raw } : {}),
        })),
        {
          scored: next.filter((i) => i.raw != null).length,
          total: next.length,
        }
      );
    },
    [autosave]
  );

  const update = useCallback(
    (next: FinalsScoreItem[]) => {
      setItems(next);
      setError(null);
      saveAll(next);
    },
    [saveAll]
  );

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

  const tied = useMemo(() => new Set(tiedEntryIds(items)), [items]);
  const scoredCount = items.filter((i) => i.raw != null).length;
  const readyForVerify = canOpenVerify(items);

  const displayOrdinals = useMemo(() => {
    const effective = items.map((item) => ({
      ...item,
      raw: sliderDraft.has(item.entryId)
        ? clampScore(sliderDraft.get(item.entryId)!)
        : item.raw,
    }));
    return partialOrdinalsFromItems(effective);
  }, [items, sliderDraft]);

  const nudge = useCallback(
    (entryId: string, delta: number) => {
      if (locked) return;
      const currentItems = itemsRef.current;
      const item = currentItems.find((i) => i.entryId === entryId);
      if (!item) return;
      update(applyRawChange(currentItems, entryId, roundScore((item.raw ?? 0) + delta)));
    },
    [locked, update]
  );

  const commitSlider = useCallback(
    (entryId: string, value: number) => {
      update(applyRawChange(itemsRef.current, entryId, value));
      setSliderDraft((prev) => {
        const next = new Map(prev);
        next.delete(entryId);
        return next;
      });
    },
    [update]
  );

  const applySpread = () => {
    const currentItems = itemsRef.current;
    const order = rankedEntryIds(currentItems);
    const rawMap = new Map(currentItems.map((i) => [i.entryId, i.raw]));
    const nextRaw = respreadRawScores(order, rawMap, { floor: 20 });
    update(
      currentItems.map((i) => ({
        ...i,
        raw: nextRaw.get(i.entryId) ?? i.raw,
      }))
    );
    setSpreadConfirmOpen(false);
    setSliderDraft(new Map());
  };

  const openVerify = async () => {
    if (!readyForVerify) {
      if (tied.size > 0) {
        setError("Two entries share the same raw score — adjust before reviewing");
      } else if (scoredCount < items.length) {
        setError("Score every couple before reviewing placements");
      }
      return;
    }
    setError(null);
    const finalized = finalizeAllRankings(items);
    if (!finalized) {
      setError("Cannot review placements — resolve ties and score all couples");
      return;
    }
    update(finalized);
    await autosave.flushNow();
    setVerifyOpen(true);
  };

  const finalSubmit = async () => {
    if (!canOpenVerify(items)) {
      setError("Cannot submit — resolve ties and ensure all couples are scored");
      return;
    }
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
    setVerifyOpen(false);
    onSubmitted();
  };

  const reviewButtonLabel = () => {
    if (tied.size > 0) return "Resolve tied scores to review";
    if (scoredCount < items.length) return `Score all couples (${scoredCount}/${items.length})`;
    return "Review placements";
  };

  const thumbsToggle = (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
      <input
        type="checkbox"
        checked={showThumbs}
        onChange={(e) => setShowThumbs(e.target.checked)}
        className="rounded border-neutral-600"
      />
      Thumbs
    </label>
  );

  return (
    <div>
      <div className={judgeSheetStickyTop}>
        <JudgeSheetHeader
          stickyHeaderExtra={stickyHeaderExtra}
          displayOrder={displayOrder}
          onDisplayOrderChange={setDisplayOrder}
          mode="raw"
          onModeChange={() => {}}
          saveState={autosave.saveState}
          showModeTabs={false}
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
      {!locked && (
        <p className="mb-2 text-xs text-neutral-500">
          Score each couple with the slider. Placement updates as you score; review before submitting.
        </p>
      )}
      {SHOW_SPREAD_SCORES_UI && !locked && (
        <button
          type="button"
          onClick={() => setSpreadConfirmOpen(true)}
          disabled={scoredCount === 0}
          className="mb-3 min-h-11 rounded-md border border-neutral-600 px-3 py-2 text-sm text-neutral-300"
        >
          Spread scores evenly
        </button>
      )}

      <JudgeConfirmDialog
        open={spreadConfirmOpen}
        title="Spread scores evenly?"
        message="Spread assigned raw scores evenly from 100 to 20 by current rank? Unscored competitors stay unscored."
        confirmLabel="Spread scores"
        onConfirm={applySpread}
        onCancel={() => setSpreadConfirmOpen(false)}
      />

      <FinalsVerifyPlacementsModal
        open={verifyOpen}
        items={items}
        entries={entries}
        submitting={submitting}
        onItemsChange={update}
        onClose={() => setVerifyOpen(false)}
        onFinalSubmit={finalSubmit}
      />

      <div className="space-y-1 overflow-x-auto">
        {heatSections.map(([heatNumber, rows]) => (
          <div key={heatNumber ?? "all"}>
            {heatNumber != null && displayOrder === "bib" && (
              <HeatSectionDivider
                heatNumber={heatNumber}
                entryCount={rows.length}
              />
            )}
            {rows.map((row) => {
              const { item } = row;
              const entry = entryById.get(item.entryId);
              const isTied = tied.has(item.entryId);
              const thumbState = thumbs.get(item.entryId) ?? { up: 0, down: 0 };

              return (
                <JudgeFinalsRow
                  key={item.entryId}
                  entry={entry}
                  raw={item.raw}
                  displayOrdinal={
                    displayOrdinals.has(item.entryId)
                      ? displayOrdinals.get(item.entryId)!
                      : null
                  }
                  isTied={isTied}
                  locked={locked}
                  showThumbs={showThumbs}
                  thumbUp={thumbState.up}
                  thumbDown={thumbState.down}
                  sliderDraftValue={sliderDraft.get(item.entryId)}
                  onSliderDraft={handleSliderDraft}
                  onSliderCommit={commitSlider}
                  onNudge={nudge}
                  onThumbsUp={handleThumbsUp}
                  onThumbsDown={handleThumbsDown}
                  reorderFading={isReorderFading(item.entryId)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {!locked && (
        <div className="sticky bottom-0 -mx-4 mt-4 border-t border-neutral-800 bg-neutral-900/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <button
            type="button"
            onClick={openVerify}
            disabled={!readyForVerify}
            className={compBtnOutlineLg}
          >
            {reviewButtonLabel()}
          </button>
        </div>
      )}
    </div>
  );
}

function buildInitialItems(
  entries: SheetEntry[],
  initialScores: {
    round_entry_id: string;
    ordinal: number | null;
    raw_score: number | null;
  }[]
): FinalsScoreItem[] {
  const scoreById = new Map(initialScores.map((s) => [s.round_entry_id, s]));
  return entries.map((e) => {
    const saved = scoreById.get(e.roundEntryId);
    return {
      entryId: e.roundEntryId,
      ordinal:
        saved?.ordinal != null && saved.ordinal > 0 ? saved.ordinal : null,
      raw:
        saved?.raw_score != null ? clampScore(Number(saved.raw_score)) : null,
    };
  });
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
