"use client";

import type { ReactNode } from "react";
import { compBtnTabActive } from "@/lib/comps/buttonStyles";
import type { DisplayOrder } from "@/lib/scoring/displayOrder";

export type JudgeSheetMode = "placement" | "raw";

export default function JudgeSheetHeader({
  stickyHeaderExtra,
  displayOrder,
  onDisplayOrderChange,
  mode,
  onModeChange,
  saveState,
  extraSummary,
  showModeTabs = true,
}: {
  stickyHeaderExtra?: ReactNode;
  displayOrder: DisplayOrder;
  onDisplayOrderChange: (order: DisplayOrder) => void;
  mode: JudgeSheetMode;
  onModeChange: (mode: JudgeSheetMode) => void;
  saveState: "idle" | "saving" | "offline";
  extraSummary?: ReactNode;
  showModeTabs?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {stickyHeaderExtra && <div className="w-full">{stickyHeaderExtra}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <span className="sr-only">Display order</span>
          <select
            value={displayOrder}
            onChange={(e) =>
              onDisplayOrderChange(e.target.value as DisplayOrder)
            }
            className="min-h-9 rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-white"
          >
            <option value="bib">Bib Order</option>
            <option value="score">Scoring Order</option>
          </select>
        </label>
        <span className="text-xs text-neutral-500">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "offline"
              ? "Offline — will retry"
              : "Saved"}
        </span>
      </div>
      {showModeTabs && (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full rounded-lg border border-neutral-700 p-0.5 sm:w-auto">
          {(
            [
              ["placement", "Placements"],
              ["raw", "Raw scores"],
            ] as [JudgeSheetMode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onModeChange(key)}
              className={
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition min-h-11 sm:flex-none " +
                (mode === key
                  ? compBtnTabActive
                  : "border border-transparent text-neutral-400 hover:text-white")
              }
            >
              {label}
            </button>
          ))}
        </div>
        {extraSummary}
      </div>
      )}
    </div>
  );
}
