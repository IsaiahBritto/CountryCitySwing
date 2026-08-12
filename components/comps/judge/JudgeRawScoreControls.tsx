"use client";

export default function JudgeRawScoreControls({
  entryId,
  raw,
  sliderDraftValue,
  locked,
  isTied,
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
      <div className="text-xs text-neutral-400">
        Raw{" "}
        <span className="font-mono text-neutral-200">
          {displayedRaw != null ? displayedRaw.toFixed(1) : "—"}
        </span>
        {isTied && (
          <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
            tied — adjust
          </span>
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
        className="mt-2 h-8 w-full touch-manipulation accent-primary"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onThumbsUp(entryId)}
          disabled={locked}
          className="flex min-h-9 items-center gap-1 rounded-md border border-neutral-600 px-2 py-1 text-sm text-neutral-200 active:bg-neutral-700 disabled:opacity-40"
          aria-label="Thumbs up"
        >
          👍
          {thumbsUp > 0 && (
            <span className="font-mono text-xs text-neutral-400">{thumbsUp}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onThumbsDown(entryId)}
          disabled={locked}
          className="flex min-h-9 items-center gap-1 rounded-md border border-neutral-600 px-2 py-1 text-sm text-neutral-200 active:bg-neutral-700 disabled:opacity-40"
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
    </>
  );
}

export function JudgeRawScoreNudgeButtons({
  entryId,
  locked,
  onNudge,
  className = "flex flex-col items-center gap-1",
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
        className="flex h-11 w-11 items-center justify-center rounded-md border border-neutral-600 text-sm font-bold text-neutral-200 active:bg-neutral-700"
        aria-label="Raise 0.1"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => onNudge(entryId, -0.1)}
        disabled={locked}
        className="flex h-11 w-11 items-center justify-center rounded-md border border-neutral-600 text-sm font-bold text-neutral-200 active:bg-neutral-700"
        aria-label="Lower 0.1"
      >
        −
      </button>
    </div>
  );
}
