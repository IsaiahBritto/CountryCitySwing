"use client";

import { memo, useRef } from "react";
import AutomatedRawBadge from "@/components/comps/judge/AutomatedRawBadge";
import { judgeTieBadgeClass } from "@/lib/comps/judgeStyles";
import { isPointerNearRangeThumb } from "@/lib/comps/rangeSliderThumb";

const SLIDER_MIN = 0;
const SLIDER_MAX = 100;

const KEYBOARD_ADJUST_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

function JudgeRawScoreControlsInner({
  entryId,
  raw,
  sliderDraftValue,
  locked,
  isTied,
  isAutomatedRaw = false,
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
  isAutomatedRaw?: boolean;
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
  const allowInputRef = useRef(false);
  const valueAtPointerDownRef = useRef(sliderValue);

  const revertSliderValue = (input: HTMLInputElement) => {
    input.value = String(valueAtPointerDownRef.current);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const rect = input.getBoundingClientRect();
    const pointerOffsetX = e.clientX - rect.left;
    allowInputRef.current = isPointerNearRangeThumb(
      sliderValue,
      SLIDER_MIN,
      SLIDER_MAX,
      rect.width,
      pointerOffsetX
    );
    valueAtPointerDownRef.current = sliderValue;
  };

  const handleSliderInput = (e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (!allowInputRef.current) {
      revertSliderValue(input);
      return;
    }
    onSliderDraft(entryId, Number(input.value));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    if (allowInputRef.current) {
      onSliderCommit(entryId, Number(e.currentTarget.value));
    }
    allowInputRef.current = false;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLInputElement>) => {
    revertSliderValue(e.currentTarget);
    allowInputRef.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (KEYBOARD_ADJUST_KEYS.has(e.key)) {
      allowInputRef.current = true;
      valueAtPointerDownRef.current = Number(e.currentTarget.value);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      onSliderCommit(entryId, Number(e.currentTarget.value));
    }
    allowInputRef.current = false;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-400">
        <span>
          Raw{" "}
          <span className="font-mono text-neutral-200">
            {displayedRaw != null ? displayedRaw.toFixed(1) : "—"}
          </span>
        </span>
        {isAutomatedRaw && <AutomatedRawBadge />}
        {isTied && (
          <span className={judgeTieBadgeClass}>tied — adjust</span>
        )}
      </div>
      <input
        type="range"
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={1}
        value={sliderValue}
        disabled={locked}
        onPointerDown={handlePointerDown}
        onInput={handleSliderInput}
        onChange={handleSliderInput}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
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
