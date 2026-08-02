"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { useAutosaveQueue } from "@/components/comps/judge/useAutosaveQueue";
import {
  applyRawChange,
  applyReorder,
  clampScore,
  roundScore,
  seedRawFromPlacements,
  tiedEntryIds,
  type FinalsScoreItem,
} from "@/lib/scoring/finalsSync";

interface SheetEntry {
  roundEntryId: string;
  bibNumber: number | null;
  displayName: string;
}

type Mode = "placement" | "raw";

export default function FinalsSheet({
  roundId,
  judgeAssignmentId,
  isOverride,
  entries,
  initialScores,
  sheetStatus,
  onSubmitted,
}: {
  roundId: string;
  judgeAssignmentId: string;
  isOverride: boolean;
  entries: SheetEntry[];
  initialScores: {
    round_entry_id: string;
    ordinal: number | null;
    raw_score: number | null;
  }[];
  sheetStatus: "draft" | "submitted";
  onSubmitted: () => void;
}) {
  const entryById = useMemo(
    () => new Map(entries.map((e) => [e.roundEntryId, e])),
    [entries]
  );

  const [items, setItems] = useState<FinalsScoreItem[]>(() =>
    buildInitialItems(entries, initialScores)
  );
  const [mode, setMode] = useState<Mode>("placement");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sliderDraft, setSliderDraft] = useState<Map<string, number>>(new Map());
  const locked = sheetStatus === "submitted";

  const autosave = useAutosaveQueue({
    roundId,
    judgeAssignmentId,
    sendAssignmentId: isOverride,
  });

  useEffect(() => {
    const restored = autosave.restoreUnsent();
    if (restored.length > 0 && !locked) {
      setItems((prev) => {
        const byId = new Map(prev.map((i) => [i.entryId, i]));
        const patched = prev.map((i) => ({ ...i }));
        for (const patch of restored) {
          const item = byId.get(patch.round_entry_id);
          if (item && typeof patch.raw_score === "number") {
            const target = patched.find((p) => p.entryId === patch.round_entry_id);
            if (target) target.raw = clampScore(patch.raw_score);
          }
        }
        return [...patched].sort((a, b) => {
          const aRaw = a.raw ?? -1;
          const bRaw = b.raw ?? -1;
          return bRaw - aRaw;
        });
      });
      setNotice("Draft restored from this device");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveAll = (next: FinalsScoreItem[]) => {
    autosave.queue(
      next.map((item, i) => ({
        round_entry_id: item.entryId,
        ordinal: i + 1,
        ...(item.raw != null ? { raw_score: item.raw } : {}),
      })),
      { scored: next.length, total: next.length }
    );
  };

  const update = (next: FinalsScoreItem[]) => {
    setItems(next);
    setError(null);
    saveAll(next);
  };

  const tied = new Set(tiedEntryIds(items));

  // --- Drag to reorder (pointer events; works for touch and mouse) ---
  const listRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{
    index: number;
    over: number;
    startY: number;
    dy: number;
    rowHeight: number;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const startDrag = (index: number, clientY: number) => {
    if (locked) return;
    const first = listRef.current?.querySelector("[data-fs-row]");
    const rowHeight = first
      ? (first as HTMLElement).getBoundingClientRect().height + 8
      : 72;
    setDrag({ index, over: index, startY: clientY, dy: 0, rowHeight });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      const shift = Math.round(dy / d.rowHeight);
      const over = Math.min(
        itemsRef.current.length - 1,
        Math.max(0, d.index + shift)
      );
      setDrag({ ...d, dy, over });
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.over !== d.index) {
        update(applyReorder(itemsRef.current, d.index, d.over));
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  /** Visual row offset while dragging (dragged row follows the pointer). */
  const rowStyle = (index: number): React.CSSProperties => {
    if (!drag) return {};
    if (index === drag.index) {
      return {
        transform: `translateY(${drag.dy}px)`,
        zIndex: 10,
        position: "relative",
      };
    }
    if (drag.over >= drag.index && index > drag.index && index <= drag.over) {
      return { transform: `translateY(-${drag.rowHeight}px)`, transition: "transform 120ms" };
    }
    if (drag.over <= drag.index && index < drag.index && index >= drag.over) {
      return { transform: `translateY(${drag.rowHeight}px)`, transition: "transform 120ms" };
    }
    return { transition: "transform 120ms" };
  };

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

  const moveTo = (index: number, target: number) => {
    if (locked || target < 0 || target >= items.length) return;
    update(applyReorder(items, index, target));
  };

  const submit = async () => {
    if (tied.size > 0) {
      setError("Two entries share the same raw score — adjust before submitting");
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
    onSubmitted();
  };

  const ordinalLabel = (n: number) =>
    `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

  return (
    <div>
      {/* Sticky header: mode toggle + save state */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-lg border border-neutral-700 p-0.5">
            {(
              [
                ["placement", "Placements"],
                ["raw", "Raw scores"],
              ] as [Mode, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                  (mode === key
                    ? "bg-primary text-black"
                    : "text-neutral-400 hover:text-white")
                }
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-neutral-500">
            {autosave.saveState === "saving"
              ? "Saving…"
              : autosave.saveState === "offline"
                ? "Offline — will retry"
                : "Saved"}
          </span>
        </div>
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
      {mode === "placement" && !locked && (
        <p className="mb-3 text-xs text-neutral-500">
          Drag the handle (or use the arrows) to rank couples — 1st place at the
          top. Raw scores follow automatically.
        </p>
      )}

      <div ref={listRef} className="space-y-2">
        {items.map((item, index) => {
          const entry = entryById.get(item.entryId);
          const isTied = tied.has(item.entryId);
          return (
            <div
              key={item.entryId}
              data-fs-row
              style={rowStyle(index)}
              className={
                "flex items-center gap-3 rounded-xl border bg-neutral-800/60 p-3 " +
                (isTied
                  ? "border-amber-500/70"
                  : drag?.index === index
                    ? "border-primary shadow-lg"
                    : "border-neutral-700")
              }
            >
              {/* Placement + bib always visible */}
              <div className="w-12 text-center">
                <div className="text-lg font-bold text-primary">
                  {ordinalLabel(index + 1)}
                </div>
                <div className="font-mono text-xs text-neutral-400">
                  #{entry?.bibNumber ?? "—"}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">
                  {entry?.displayName}
                </div>
                <div className="text-xs text-neutral-400">
                  Raw{" "}
                  <span className="font-mono text-neutral-200">
                    {item.raw != null ? item.raw.toFixed(1) : "—"}
                  </span>
                  {isTied && (
                    <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                      tied — adjust
                    </span>
                  )}
                </div>
                {mode === "raw" && (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(
                      sliderDraft.get(item.entryId) ?? item.raw ?? 0
                    )}
                    disabled={locked}
                    onChange={(e) =>
                      setSliderDraft((prev) => {
                        const next = new Map(prev);
                        next.set(item.entryId, Number(e.target.value));
                        return next;
                      })
                    }
                    onPointerUp={(e) =>
                      commitSlider(item.entryId, Number(e.currentTarget.value))
                    }
                    onKeyUp={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        commitSlider(
                          item.entryId,
                          Number((e.target as HTMLInputElement).value)
                        );
                      }
                    }}
                    className="mt-2 w-full accent-primary"
                  />
                )}
              </div>

              {mode === "raw" ? (
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => nudge(item.entryId, 0.1)}
                    disabled={locked}
                    className="h-8 w-10 rounded-md border border-neutral-600 text-sm font-bold text-neutral-200 active:bg-neutral-700"
                    aria-label="Raise 0.1"
                  >
                    +
                  </button>
                  <button
                    onClick={() => nudge(item.entryId, -0.1)}
                    disabled={locked}
                    className="h-8 w-10 rounded-md border border-neutral-600 text-sm font-bold text-neutral-200 active:bg-neutral-700"
                    aria-label="Lower 0.1"
                  >
                    −
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveTo(index, index - 1)}
                      disabled={locked || index === 0}
                      className="h-7 w-8 rounded-md border border-neutral-600 text-xs text-neutral-300 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveTo(index, index + 1)}
                      disabled={locked || index === items.length - 1}
                      className="h-7 w-8 rounded-md border border-neutral-600 text-xs text-neutral-300 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <div
                    onPointerDown={(e) => {
                      e.preventDefault();
                      startDrag(index, e.clientY);
                    }}
                    className={
                      "flex h-14 w-8 cursor-grab touch-none select-none items-center justify-center rounded-md border border-neutral-600 text-neutral-400 " +
                      (locked ? "opacity-40" : "active:cursor-grabbing")
                    }
                    aria-label="Drag to reorder"
                  >
                    ⠿
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!locked && (
        <button
          onClick={submit}
          disabled={submitting || tied.size > 0}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-base font-semibold text-black disabled:opacity-40"
        >
          {submitting
            ? "Submitting…"
            : tied.size > 0
              ? "Resolve tied scores to submit"
              : "Submit sheet"}
        </button>
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
  const withOrdinals = entries.filter(
    (e) => scoreById.get(e.roundEntryId)?.ordinal != null
  );

  // Full draft on the server: restore its order and raws.
  if (withOrdinals.length === entries.length && entries.length > 0) {
    const ordered = [...entries].sort(
      (a, b) =>
        (scoreById.get(a.roundEntryId)!.ordinal ?? 0) -
        (scoreById.get(b.roundEntryId)!.ordinal ?? 0)
    );
    const seeded = seedRawFromPlacements(ordered.map((e) => e.roundEntryId));
    return ordered.map((e, i) => {
      const raw = scoreById.get(e.roundEntryId)?.raw_score;
      return {
        entryId: e.roundEntryId,
        raw: raw != null ? clampScore(raw) : seeded[i].raw,
      };
    });
  }

  // Fresh sheet: dance order with no prefilled raw scores.
  return entries.map((e) => ({ entryId: e.roundEntryId, raw: null }));
}
