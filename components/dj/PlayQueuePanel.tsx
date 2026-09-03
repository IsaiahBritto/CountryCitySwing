"use client";

import type { DeckId, DeckTrack, AfterQueueBehavior } from "@/lib/spotify/djDeckState";
import {
  formatTrackDuration,
  formatTotalDuration,
  playQueueTotalDurationMs,
} from "@/lib/spotify/djDeckState";

export type PlayQueuePanelProps = {
  deckId: DeckId;
  playQueue: DeckTrack[];
  rowStatus: (index: number) => "played" | "current" | "upcoming";
  onPlayFromRow: (index: number) => void;
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  afterQueueBehavior: AfterQueueBehavior;
  onAfterQueueBehaviorChange: (behavior: AfterQueueBehavior) => void;
  afterQueueContinueDeck: DeckId;
  onAfterQueueContinueDeckChange: (deck: DeckId) => void;
  secondDeckEnabled: boolean;
  highlightedIndex: number | null;
  disabled?: boolean;
};

function AfterQueueSettings({
  afterQueueBehavior,
  onAfterQueueBehaviorChange,
  afterQueueContinueDeck,
  onAfterQueueContinueDeckChange,
  secondDeckEnabled,
  disabled,
}: Pick<
  PlayQueuePanelProps,
  | "afterQueueBehavior"
  | "onAfterQueueBehaviorChange"
  | "afterQueueContinueDeck"
  | "onAfterQueueContinueDeckChange"
  | "secondDeckEnabled"
  | "disabled"
>) {
  return (
    <>
      <p className="text-[10px] uppercase text-neutral-500 hidden sm:block">
        After queue completes
      </p>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAfterQueueBehaviorChange("continue")}
          className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium border disabled:opacity-40 ${
            afterQueueBehavior === "continue"
              ? "bg-neutral-200 text-neutral-900 border-neutral-200"
              : "border-neutral-600 text-neutral-400 hover:bg-neutral-800"
          }`}
        >
          <span className="sm:hidden">Continue</span>
          <span className="hidden sm:inline">Continue playlist</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAfterQueueBehaviorChange("stop")}
          className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium border disabled:opacity-40 ${
            afterQueueBehavior === "stop"
              ? "bg-neutral-200 text-neutral-900 border-neutral-200"
              : "border-neutral-600 text-neutral-400 hover:bg-neutral-800"
          }`}
        >
          Stop
        </button>
      </div>
      {afterQueueBehavior === "continue" && secondDeckEnabled && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500 uppercase hidden sm:inline">
            Play from
          </span>
          <div className="flex rounded overflow-hidden border border-neutral-700">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAfterQueueContinueDeckChange("A")}
              className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold disabled:opacity-40 ${
                afterQueueContinueDeck === "A"
                  ? "bg-orange-600 text-white"
                  : "bg-neutral-900 text-orange-400/70"
              }`}
            >
              A
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAfterQueueContinueDeckChange("B")}
              className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold disabled:opacity-40 ${
                afterQueueContinueDeck === "B"
                  ? "bg-red-700 text-white"
                  : "bg-neutral-900 text-red-400/70"
              }`}
            >
              B
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function PlayQueuePanel({
  deckId,
  playQueue,
  rowStatus,
  onPlayFromRow,
  onRemove,
  onMoveUp,
  onMoveDown,
  afterQueueBehavior,
  onAfterQueueBehaviorChange,
  afterQueueContinueDeck,
  onAfterQueueContinueDeckChange,
  secondDeckEnabled,
  highlightedIndex,
  disabled = false,
}: PlayQueuePanelProps) {
  const accentBorder =
    deckId === "A" ? "border-orange-500/40" : "border-red-500/40";
  const accentText = deckId === "A" ? "text-orange-400" : "text-red-400";

  const rowClass = (status: ReturnType<PlayQueuePanelProps["rowStatus"]>) => {
    switch (status) {
      case "current":
        return deckId === "A"
          ? "bg-amber-950/40 border-l-2 border-l-amber-500"
          : "bg-red-950/30 border-l-2 border-l-red-500";
      case "played":
        return "opacity-40";
      default:
        return "border-l-2 border-l-transparent";
    }
  };

  const settingsProps = {
    afterQueueBehavior,
    onAfterQueueBehaviorChange,
    afterQueueContinueDeck,
    onAfterQueueContinueDeckChange,
    secondDeckEnabled,
    disabled,
  };

  return (
    <div
      className={`flex flex-col rounded-xl border ${accentBorder} bg-neutral-950/80 overflow-hidden min-w-0`}
    >
      <div className="px-2 py-1.5 sm:px-4 sm:py-2 border-b border-neutral-700 bg-neutral-900/80">
        <h3 className="text-[10px] sm:text-xs uppercase tracking-wide text-neutral-500 truncate">
          Queue
          <span className="text-neutral-400 normal-case ml-1 sm:ml-2">
            {playQueue.length} ·{" "}
            {formatTotalDuration(playQueueTotalDurationMs(playQueue))}
          </span>
        </h3>
      </div>

      <div className="overflow-y-auto flex-1 max-h-[160px] sm:max-h-[200px] min-w-0">
        <table className="w-full table-fixed text-xs sm:text-sm">
          <thead className="sticky top-0 bg-neutral-900 z-10">
            <tr className="text-left text-[10px] sm:text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-700">
              <th className="hidden sm:table-cell px-2 py-2 w-8">#</th>
              <th className="px-1.5 py-1 sm:px-2 sm:py-2 w-8"></th>
              <th className="px-1.5 py-1 sm:px-2 sm:py-2 w-[45%]">Artist</th>
              <th className="px-1.5 py-1 sm:px-2 sm:py-2 w-[45%]">Title</th>
              <th className="hidden sm:table-cell px-2 py-2 w-14 text-right">
                Time
              </th>
              <th className="px-1.5 py-1 sm:px-2 sm:py-2 w-12 sm:w-24 text-right">
                Act
              </th>
            </tr>
          </thead>
          <tbody>
            {playQueue.map((track, index) => {
              const status = rowStatus(index);
              return (
                <tr
                  key={`${track.id}-${index}`}
                  className={`border-b border-neutral-800/80 hover:bg-neutral-800/40 ${rowClass(status)} ${
                    highlightedIndex === index
                      ? "outline outline-1 outline-neutral-500"
                      : ""
                  }`}
                >
                  <td className="hidden sm:table-cell px-2 py-1.5 text-neutral-500 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPlayFromRow(index)}
                      className={`${accentText} hover:opacity-80 disabled:opacity-40 text-xs`}
                      aria-label={`Play ${track.name}`}
                    >
                      ▶
                    </button>
                  </td>
                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 truncate opacity-90">
                    {track.primaryArtist}
                  </td>
                  <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-neutral-100 truncate">
                    {track.name}
                  </td>
                  <td className="hidden sm:table-cell px-2 py-1.5 text-right text-neutral-400 tabular-nums">
                    {formatTrackDuration(track.durationMs)}
                  </td>
                  <td className="px-1 py-1 sm:px-2 sm:py-1.5">
                    <div className="flex justify-end gap-0.5">
                      <button
                        type="button"
                        disabled={disabled || index === 0}
                        onClick={() => onMoveUp(index)}
                        className="text-[10px] px-0.5 sm:px-1 py-0.5 rounded border border-neutral-600 text-neutral-400 hover:bg-neutral-800 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={disabled || index === playQueue.length - 1}
                        onClick={() => onMoveDown(index)}
                        className="text-[10px] px-0.5 sm:px-1 py-0.5 rounded border border-neutral-600 text-neutral-400 hover:bg-neutral-800 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onRemove(index)}
                        className="text-[10px] px-0.5 sm:px-1 py-0.5 rounded border border-neutral-600 text-red-400/80 hover:bg-red-950/40 disabled:opacity-30"
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-2 py-2 sm:px-4 sm:py-3 border-t border-neutral-700 bg-neutral-900/50 space-y-2">
        <details className="sm:hidden group">
          <summary className="text-[10px] uppercase text-neutral-500 cursor-pointer list-none flex items-center justify-between">
            Queue settings
            <span className="text-neutral-600 group-open:rotate-180 transition-transform">
              ▾
            </span>
          </summary>
          <div className="pt-2 space-y-2">
            <AfterQueueSettings {...settingsProps} />
          </div>
        </details>
        <div className="hidden sm:block space-y-2">
          <AfterQueueSettings {...settingsProps} />
        </div>
      </div>
    </div>
  );
}
