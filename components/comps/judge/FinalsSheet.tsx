"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnOutlineLg, compBtnOutlineSm, judgeSheetStickyTop } from "@/lib/comps/buttonStyles";
import HeatSectionDivider from "@/components/comps/judge/HeatSectionDivider";
import JudgeConfirmDialog from "@/components/comps/judge/JudgeConfirmDialog";
import JudgeSheetHeader from "@/components/comps/judge/JudgeSheetHeader";
import JudgeRawScoreControls, {
  JudgeRawScoreNudgeButtons,
} from "@/components/comps/judge/JudgeRawScoreControls";
import FinalsVerifyPlacementsModal from "@/components/comps/judge/FinalsVerifyPlacementsModal";
import { useAutosaveQueue } from "@/components/comps/judge/useAutosaveQueue";
import {
  applyRawChange,
  canOpenVerify,
  clampScore,
  finalizeAllRankings,
  ordinalLabel,
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
  const locked = sheetStatus === "submitted";

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

  const heatSections = useMemo(() => {
    if (displayOrder !== "bib") {
      return [[null, displayRows] as const];
    }
    const hasHeat = displayRows.some(
      (r) => entryById.get(r.entryId)?.heatNumber != null
    );
    if (!hasHeat) {
      return [[null, displayRows] as const];
    }
    const map = new Map<number | null, typeof displayRows>();
    for (const row of displayRows) {
      const heatNumber = entryById.get(row.entryId)?.heatNumber ?? null;
      map.set(heatNumber, [...(map.get(heatNumber) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  }, [displayRows, displayOrder, entryById]);

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

  const saveAll = (next: FinalsScoreItem[]) => {
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
  };

  const update = (next: FinalsScoreItem[]) => {
    setItems(next);
    setError(null);
    saveAll(next);
  };

  const saveThumbs = (entryId: string, patch: Partial<ThumbsState>) => {
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
  };

  const tied = new Set(tiedEntryIds(items));
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

  const nudge = (entryId: string, delta: number) => {
    if (locked) return;
    const item = items.find((i) => i.entryId === entryId);
    if (!item) return;
    update(applyRawChange(items, entryId, roundScore((item.raw ?? 0) + delta)));
  };

  const commitSlider = (entryId: string, value: number) => {
    update(applyRawChange(items, entryId, value));
    setSliderDraft((prev) => {
      const next = new Map(prev);
      next.delete(entryId);
      return next;
    });
  };

  const applySpread = () => {
    const order = rankedEntryIds(items);
    const rawMap = new Map(items.map((i) => [i.entryId, i.raw]));
    const nextRaw = respreadRawScores(order, rawMap, { floor: 20 });
    update(
      items.map((i) => ({
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
        <>
          <p className="mb-2 text-xs text-neutral-500">
            Score each couple with the slider. Placement updates as you score; review before submitting.
          </p>
          <button
            type="button"
            onClick={() => setSpreadConfirmOpen(true)}
            disabled={scoredCount === 0}
            className={compBtnOutlineSm + " mb-3 min-h-11"}
          >
            Spread scores evenly
          </button>
        </>
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

      <div className="space-y-2 overflow-x-auto">
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
                <div
                  key={item.entryId}
                  className={
                    "mb-2 flex min-w-0 items-center gap-3 rounded-xl border bg-neutral-800/60 p-3 " +
                    (isTied ? "border-amber-500/70" : "border-neutral-700")
                  }
                >
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-2xl font-bold text-white">
                      {entry?.bibNumber ?? "—"}
                    </div>
                    {entry?.followBibNumber != null && (
                      <div className="font-mono text-xs text-neutral-500">
                        +{entry.followBibNumber}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-bold text-primary">
                      {displayOrdinals.has(item.entryId)
                        ? ordinalLabel(displayOrdinals.get(item.entryId)!)
                        : "—"}
                    </div>
                    {entry?.followDisplayName ? (
                      <>
                        <div className="truncate text-sm text-neutral-300">
                          {entry.leadDisplayName ??
                            entry.displayName.split(" & ")[0]}
                        </div>
                        <div className="truncate text-xs text-neutral-500">
                          {entry.followDisplayName}
                        </div>
                      </>
                    ) : (
                      <div className="truncate text-sm text-white">
                        {entry?.displayName}
                      </div>
                    )}
                    <JudgeRawScoreControls
                      entryId={item.entryId}
                      raw={item.raw}
                      sliderDraftValue={sliderDraft.get(item.entryId)}
                      locked={locked}
                      isTied={isTied}
                      thumbsUp={thumbState.up}
                      thumbsDown={thumbState.down}
                      onSliderDraft={(id, value) =>
                        setSliderDraft((prev) => {
                          const next = new Map(prev);
                          next.set(id, value);
                          return next;
                        })
                      }
                      onSliderCommit={commitSlider}
                      onThumbsUp={(id) =>
                        saveThumbs(id, {
                          up: (thumbs.get(id)?.up ?? 0) + 1,
                        })
                      }
                      onThumbsDown={(id) =>
                        saveThumbs(id, {
                          down: (thumbs.get(id)?.down ?? 0) + 1,
                        })
                      }
                    />
                  </div>

                  <JudgeRawScoreNudgeButtons
                    entryId={item.entryId}
                    locked={locked}
                    onNudge={nudge}
                  />
                </div>
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
