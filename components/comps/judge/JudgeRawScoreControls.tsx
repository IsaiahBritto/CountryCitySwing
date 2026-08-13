"use client";

import { memo } from "react";
import { judgeTieBadgeClass } from "@/lib/comps/judgeStyles";

function JudgeRawScoreControlsInner({
  entryId,
  raw,
  sliderDraftValue,
  locked,
  isTied,
  showThumbs = true,
  thumbsUp,
  thumbsDown,
  onSliderDraft,
  onSliderCommit,
  onThumbsUp,
  onThumbsDown,
}: {
  entryId: string;
  raw: number | null;
  sliderDraftValue: number | undefined;
  locked: boolean;
  isTied?: boolean;
  showThumbs?: boolean;
  thumbsUp: number;
  thumbsDown: number;
  onSliderDraft: (entryId: string, value: number) => void;
  onSliderCommit: (entryId: string, value: number) => void;
  onThumbsUp: (entryId: string) => void;
  onThumbsDown: (entryId: string) => void;
}) {
  const displayedRaw = sliderDraftValue ?? raw;
  const sliderValue = Math.round(sliderDraftValue ?? raw ?? 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-400">
        <span>
          Raw{" "}
          <span className="font-mono text-neutral-200">
            {displayedRaw != null ? displayedRaw.toFixed(1) : "—"}
          </span>
        </span>
        {isTied && (
          <span className={judgeTieBadgeClass}>tied — adjust</span>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={sliderValue}
        disabled={locked}
        onInput={(e) =>
          onSliderDraft(entryId, Number(e.currentTarget.value))
        }
        onChange={(e) => onSliderDraft(entryId, Number(e.target.value))}
        onPointerUp={(e) =>
          onSliderCommit(entryId, Number(e.currentTarget.value))
        }
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onSliderCommit(
              entryId,
              Number((e.target as HTMLInputElement).value)
            );
          }
        }}
        className="mt-1 h-6 w-full touch-manipulation accent-primary"
      />
      {showThumbs && (
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onThumbsUp(entryId)}
            disabled={locked}
            className="flex min-h-8 items-center gap-1 rounded-md border border-neutral-600 px-2 py-0.5 text-sm text-neutral-200 active:bg-neutral-700 disabled:opacity-40"
            aria-label="Thumbs up"
          >
            👍
            {thumbsUp > 0 && (
              <span className="font-mono text-xs text-neutral-400">
                {thumbsUp}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onThumbsDown(entryId)}
            disabled={locked}
            className="flex min-h-8 items-center gap-1 rounded-md border border-neutral-600 px-2 py-0.5 text-sm text-neutral-200 active:bg-neutral-700 disabled:opacity-40"
            aria-label="Thumbs down"
          >
            👎
            {thumbsDown > 0 && (
              <span className="font-mono text-xs text-neutral-400">
                {thumbsDown}
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
}

const JudgeRawScoreControls = memo(JudgeRawScoreControlsInner);
export default JudgeRawScoreControls;

export function JudgeRawScoreNudgeButtons({
  entryId,
  locked,
  onNudge,
  className = "flex shrink-0 flex-col items-center gap-0.5",
}: {
  entryId: string;
  locked: boolean;
  onNudge: (entryId: string, delta: number) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => onNudge(entryId, 0.1)}
        disabled={locked}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-600 text-sm font-bold text-neutral-200 active:bg-neutral-700"
        aria-label="Raise 0.1"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => onNudge(entryId, -0.1)}
        disabled={locked}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-600 text-sm font-bold text-neutral-200 active:bg-neutral-700"
        aria-label="Lower 0.1"
      >
        −
      </button>
    </div>
  );
}
