"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { compBtnOutlineLg, compBtnOutlineSm } from "@/lib/comps/buttonStyles";
import {
  itemsInRankOrder,
  ordinalLabel,
  reorderMovedEntry,
  type FinalsScoreItem,
} from "@/lib/scoring/finalsSync";

interface VerifyEntry {
  roundEntryId: string;
  bibNumber: number | null;
  displayName: string;
  leadDisplayName?: string | null;
  followBibNumber?: number | null;
  followDisplayName?: string | null;
}

export default function FinalsVerifyPlacementsModal({
  open,
  items,
  entries,
  submitting,
  onItemsChange,
  onClose,
  onFinalSubmit,
}: {
  open: boolean;
  items: FinalsScoreItem[];
  entries: VerifyEntry[];
  submitting: boolean;
  onItemsChange: (items: FinalsScoreItem[]) => void;
  onClose: () => void;
  onFinalSubmit: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  const entryById = useMemo(
    () => new Map(entries.map((e) => [e.roundEntryId, e])),
    [entries]
  );

  const rankedRows = useMemo(() => itemsInRankOrder(items), [items]);

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
  const rankedRef = useRef(rankedRows);
  rankedRef.current = rankedRows;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      const shift = Math.round(dy / d.rowHeight);
      const over = Math.min(
        rankedRef.current.length - 1,
        Math.max(0, d.index + shift)
      );
      setDrag({ ...d, dy, over });
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.over !== d.index) {
        const rows = rankedRef.current;
        const fromId = rows[d.index].entryId;
        const toId = rows[d.over].entryId;
        onItemsChange(reorderMovedEntry(itemsRef.current, fromId, toId));
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
  }, [drag, onItemsChange]);

  const rowStyle = (index: number): CSSProperties => {
    if (!drag) return {};
    if (index === drag.index) {
      return {
        transform: `translateY(${drag.dy}px)`,
        zIndex: 10,
        position: "relative",
      };
    }
    if (drag.over >= drag.index && index > drag.index && index <= drag.over) {
      return {
        transform: `translateY(-${drag.rowHeight}px)`,
        transition: "transform 120ms",
      };
    }
    if (drag.over <= drag.index && index < drag.index && index >= drag.over) {
      return {
        transform: `translateY(${drag.rowHeight}px)`,
        transition: "transform 120ms",
      };
    }
    return { transition: "transform 120ms" };
  };

  const moveTo = (index: number, target: number) => {
    if (target < 0 || target >= rankedRows.length) return;
    const fromId = rankedRows[index].entryId;
    const toId = rankedRows[target].entryId;
    onItemsChange(reorderMovedEntry(items, fromId, toId));
  };

  const startDrag = (index: number, clientY: number) => {
    const first = listRef.current?.querySelector("[data-verify-row]");
    const rowHeight = first
      ? (first as HTMLElement).getBoundingClientRect().height + 8
      : 72;
    setDrag({ index, over: index, startY: clientY, dy: 0, rowHeight });
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950"
      style={{ height: "100dvh" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-placements-title"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4">
        <header className="shrink-0 pt-4 pb-2">
          <h2
            id="verify-placements-title"
            className="text-lg font-semibold text-white"
          >
            Verify Placements
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Confirm rank order before submitting. Reordering adjusts only the
            moved couple&apos;s raw score to fit between neighbors.
          </p>
        </header>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-2"
        >
          <div className="space-y-2">
            {rankedRows.map((item, index) => {
              const entry = entryById.get(item.entryId);
              return (
                <div
                  key={item.entryId}
                  data-verify-row
                  style={rowStyle(index)}
                  className={
                    "flex min-w-0 items-center gap-3 rounded-xl border bg-neutral-800/60 p-3 " +
                    (drag?.index === index
                      ? "border-primary shadow-lg"
                      : "border-neutral-700")
                  }
                >
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-lg font-bold text-primary">
                      {ordinalLabel(index + 1)}
                    </div>
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
                    <div className="mt-1 text-xs text-neutral-400">
                      Raw{" "}
                      <span className="font-mono text-neutral-200">
                        {item.raw != null ? item.raw.toFixed(1) : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => moveTo(index, index - 1)}
                        disabled={index === 0 || submitting}
                        className="flex h-9 w-10 items-center justify-center rounded-md border border-neutral-600 text-xs text-neutral-300 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTo(index, index + 1)}
                        disabled={
                          index === rankedRows.length - 1 || submitting
                        }
                        className="flex h-9 w-10 items-center justify-center rounded-md border border-neutral-600 text-xs text-neutral-300 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>
                    <div
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (!submitting) startDrag(index, e.clientY);
                      }}
                      className="flex h-14 w-10 cursor-grab touch-none select-none items-center justify-center rounded-md border border-neutral-600 text-neutral-400 active:cursor-grabbing"
                      aria-label="Drag to reorder"
                    >
                      ⠿
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex w-full max-w-2xl flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={
              compBtnOutlineSm +
              " min-h-11 border-neutral-600 text-neutral-300"
            }
          >
            Back to scoring
          </button>
          <button
            type="button"
            onClick={onFinalSubmit}
            disabled={submitting}
            className={compBtnOutlineLg + " min-h-11 w-full sm:w-auto"}
          >
            {submitting ? "Submitting…" : "Submit sheet"}
          </button>
        </div>
      </footer>
    </div>,
    document.body
  );
}
