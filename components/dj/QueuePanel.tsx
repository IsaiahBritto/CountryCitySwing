"use client";

import { useEffect, useRef } from "react";
import type { DeckId, DeckTrack, QueueRowStatus } from "@/lib/spotify/djDeckState";
import {
  formatTotalDuration,
  formatTrackDuration,
} from "@/lib/spotify/djDeckState";

export type QueuePanelProps = {
  queue: DeckTrack[];
  rowStatus: (index: number) => QueueRowStatus;
  onLoadToDeck: (index: number, deck: DeckId) => void;
  onPlayFromRow: (index: number) => void;
  highlightedIndex: number | null;
  totalDurationMs: number;
  disabled?: boolean;
};

export default function QueuePanel({
  queue,
  rowStatus,
  onLoadToDeck,
  onPlayFromRow,
  highlightedIndex,
  totalDurationMs,
  disabled = false,
}: QueuePanelProps) {
  const currentRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    const currentIndex = queue.findIndex((_, i) => rowStatus(i) === "current");
    if (currentIndex >= 0) {
      const row = document.querySelector(
        `[data-queue-index="${currentIndex}"]`
      );
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [queue, rowStatus]);

  const rowClass = (status: QueueRowStatus) => {
    switch (status) {
      case "current":
        return "bg-amber-950/40 border-l-2 border-l-amber-500";
      case "next":
        return "bg-emerald-950/20 border-l-2 border-l-emerald-600/60";
      case "played":
        return "opacity-40";
      default:
        return "border-l-2 border-l-transparent";
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-[280px] rounded-xl border border-neutral-700 bg-neutral-950/60 overflow-hidden">
      <div className="overflow-y-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-900 z-10">
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-700">
              <th className="px-3 py-2 w-10">#</th>
              <th className="px-2 py-2 w-10"></th>
              <th className="px-2 py-2">Artist</th>
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2 w-16 text-right">BPM</th>
              <th className="px-2 py-2 w-16 text-right">Time</th>
              <th className="px-2 py-2 w-20 text-right">Load</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((track, index) => {
              const status = rowStatus(index);
              const highlighted = highlightedIndex === index;
              return (
                <tr
                  key={`${track.id}-${index}`}
                  data-queue-index={index}
                  ref={status === "current" ? currentRef : undefined}
                  className={`border-b border-neutral-800/80 hover:bg-neutral-800/40 ${rowClass(status)} ${
                    highlighted ? "outline outline-1 outline-neutral-500" : ""
                  }`}
                  onDoubleClick={() => onLoadToDeck(index, status === "current" ? "B" : "A")}
                >
                  <td className="px-3 py-2 text-neutral-500 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPlayFromRow(index)}
                      className="text-orange-400 hover:text-orange-300 disabled:opacity-40"
                      aria-label={`Play ${track.name}`}
                    >
                      ▶
                    </button>
                  </td>
                  <td className="px-2 py-2 text-orange-400/90 truncate max-w-[180px]">
                    {track.primaryArtist}
                  </td>
                  <td className="px-2 py-2 text-neutral-100 truncate max-w-[240px]">
                    {track.name}
                  </td>
                  <td className="px-2 py-2 text-right text-neutral-400 tabular-nums">
                    {track.bpm ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right text-neutral-400 tabular-nums">
                    {formatTrackDuration(track.durationMs)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onLoadToDeck(index, "A")}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-orange-500/40 text-orange-300 hover:bg-orange-950/50 disabled:opacity-40"
                      >
                        A
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onLoadToDeck(index, "B")}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/40 text-red-300 hover:bg-red-950/50 disabled:opacity-40"
                      >
                        B
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="px-4 py-2 border-t border-neutral-700 text-xs text-neutral-500">
        {queue.length} tracks · {formatTotalDuration(totalDurationMs)} total
      </footer>
    </div>
  );
}
