"use client";

import type { ReactNode } from "react";
import { compBtnTabActive } from "@/lib/comps/buttonStyles";
import type { DisplayOrder } from "@/lib/scoring/displayOrder";
import type { CallbackJudgingMethod } from "@/lib/comps/types";

export type JudgeSheetMode = "placement" | "raw";

export default function JudgeSheetHeader({
  stickyHeaderExtra,
  displayOrder,
  onDisplayOrderChange,
  mode,
  onModeChange,
  saveState,
  extraSummary,
  headerControls,
  showModeTabs = true,
  primaryMethod = null,
  tabLockHint = null,
}: {
  stickyHeaderExtra?: ReactNode;
  displayOrder: DisplayOrder;
  onDisplayOrderChange: (order: DisplayOrder) => void;
  mode: JudgeSheetMode;
  onModeChange: (mode: JudgeSheetMode) => void;
  saveState: "idle" | "saving" | "offline";
  extraSummary?: ReactNode;
  headerControls?: ReactNode;
  showModeTabs?: boolean;
  /** When set and primary scoring incomplete, the other tab is disabled. */
  primaryMethod?: CallbackJudgingMethod | null;
  tabLockHint?: string | null;
}) {
  const tabs: [JudgeSheetMode, string][] = [
    ["placement", "Yes / No / Alts"],
    ["raw", "Raw scores"],
  ];

  return (
    <div className="flex flex-col gap-2">
      {stickyHeaderExtra && <div className="w-full">{stickyHeaderExtra}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
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
          {headerControls}
        </div>
        <span className="text-xs text-neutral-500">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "offline"
              ? "Offline — will retry"
              : "Saved"}
        </span>
      </div>
      {showModeTabs && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex w-full rounded-lg border border-neutral-700 p-0.5 sm:w-auto">
              {tabs.map(([key, label]) => {
                const isActive = mode === key;
                const isLockedOpposite =
                  primaryMethod != null &&
                  tabLockHint != null &&
                  key !== primaryMethod;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isLockedOpposite}
                    aria-disabled={isLockedOpposite}
                    title={isLockedOpposite ? tabLockHint ?? undefined : undefined}
                    onClick={() => {
                      if (!isLockedOpposite) onModeChange(key);
                    }}
                    className={
                      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition min-h-11 sm:flex-none " +
                      (isLockedOpposite
                        ? "cursor-not-allowed border border-transparent text-neutral-600 opacity-40"
                        : isActive
                          ? compBtnTabActive
                          : "border border-transparent text-neutral-400 hover:text-white")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {extraSummary}
          </div>
          {tabLockHint && primaryMethod != null && (
            <p className="text-xs text-neutral-500">{tabLockHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
