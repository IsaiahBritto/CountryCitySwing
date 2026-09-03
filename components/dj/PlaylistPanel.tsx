"use client";

import { useEffect, useRef } from "react";
import type { DeckId, DeckTrack, QueueRowStatus } from "@/lib/spotify/djDeckState";
import {
  formatTotalDuration,
  formatTrackDuration,
} from "@/lib/spotify/djDeckState";

export type PlaylistPanelProps = {
  deckId: DeckId;
  title: string | null;
  playlist: DeckTrack[];
  currentPlaylistIndex: number | null;
  rowStatus: (index: number) => QueueRowStatus;
  onPlayFromRow: (index: number) => void;
  onAddToQueue: (index: number) => void;
  isInPlayQueue: (trackId: string) => boolean;
  highlightedIndex: number | null;
  totalDurationMs: number;
  disabled?: boolean;
};

export default function PlaylistPanel({
  deckId,
  title,
  playlist,
  currentPlaylistIndex,
  rowStatus,
  onPlayFromRow,
  onAddToQueue,
  isInPlayQueue,
  highlightedIndex,
  totalDurationMs,
  disabled = false,
}: PlaylistPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (currentPlaylistIndex == null || currentPlaylistIndex < 0) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const row = container.querySelector(
      `[data-playlist-index="${deckId}-${currentPlaylistIndex}"]`
    ) as HTMLElement | null;
    if (!row) return;

    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (rowTop < viewTop) {
      container.scrollTop = rowTop;
    } else if (rowBottom > viewBottom) {
      container.scrollTop = rowBottom - container.clientHeight;
    }
  }, [currentPlaylistIndex, deckId]);

  const rowClass = (status: QueueRowStatus) => {
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

  return (
    <div className="flex flex-col flex-1 min-h-[200px] sm:min-h-[280px] rounded-xl border border-neutral-700 bg-neutral-950/60 overflow-hidden min-w-0">
      <div className="px-2 py-1.5 sm:px-4 sm:py-2 border-b border-neutral-700 bg-neutral-900/80">
        <h3 className="text-[10px] sm:text-xs uppercase tracking-wide text-neutral-500 truncate">
          Playlist
          {title ? (
            <span className="text-neutral-300 normal-case ml-1 sm:ml-2">
              {title}
            </span>
          ) : null}
        </h3>
      </div>
      <div ref={scrollContainerRef} className="overflow-y-auto flex-1 min-w-0">
        <table className="w-full table-fixed text-xs sm:text-sm">
          <thead className="sticky top-0 bg-neutral-900 z-10">
            <tr className="text-left text-[10px] sm:text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-700">
              <th className="hidden sm:table-cell px-3 py-2 w-10">#</th>
              <th className="px-1.5 py-1 sm:px-2 sm:py-2 w-8"></th>
              <th className="px-1.5 py-1 sm:px-2 sm:py-2 w-[40%] sm:w-auto">
                Artist
              </th>
              <th className="px-1.5 py-1 sm:px-2 sm:py-2 w-[40%] sm:w-auto">
                Title
              </th>
              <th className="hidden sm:table-cell px-2 py-2 w-16 text-right">
                BPM
              </th>
              <th className="hidden sm:table-cell px-2 py-2 w-16 text-right">
                Time
              </th>
              <th className="px-1.5 py-1 sm:px-2 sm:py-2 w-10 sm:w-20 text-right">
                Queue
              </th>
            </tr>
          </thead>
          <tbody>
            {playlist.map((track, index) => {
              const status = rowStatus(index);
              const inQueue = isInPlayQueue(track.id);
              const highlighted = highlightedIndex === index;
              return (
                <tr
                  key={`${track.id}-${index}`}
                  data-playlist-index={`${deckId}-${index}`}
                  className={`border-b border-neutral-800/80 hover:bg-neutral-800/40 ${rowClass(status)} ${
                    inQueue ? "bg-neutral-800/20" : ""
                  } ${highlighted ? "outline outline-1 outline-neutral-500" : ""}`}
                  onDoubleClick={() => onPlayFromRow(index)}
                >
                  <td className="hidden sm:table-cell px-3 py-2 text-neutral-500 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-1.5 py-1 sm:px-2 sm:py-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPlayFromRow(index)}
                      className="text-orange-400 hover:text-orange-300 disabled:opacity-40 text-xs"
                      aria-label={`Play ${track.name}`}
                    >
                      ▶
                    </button>
                  </td>
                  <td className="px-1.5 py-1 sm:px-2 sm:py-2 text-orange-400/90 truncate">
                    {track.primaryArtist}
                  </td>
                  <td className="px-1.5 py-1 sm:px-2 sm:py-2 text-neutral-100 truncate">
                    {track.name}
                  </td>
                  <td className="hidden sm:table-cell px-2 py-2 text-right text-neutral-400 tabular-nums">
                    {track.bpm ?? "—"}
                  </td>
                  <td className="hidden sm:table-cell px-2 py-2 text-right text-neutral-400 tabular-nums">
                    {formatTrackDuration(track.durationMs)}
                  </td>
                  <td className="px-1.5 py-1 sm:px-2 sm:py-2 text-right">
                    <button
                      type="button"
                      disabled={disabled || inQueue}
                      onClick={() => onAddToQueue(index)}
                      className="text-[10px] px-1 sm:px-1.5 py-0.5 rounded border border-emerald-600/40 text-emerald-400 hover:bg-emerald-950/40 disabled:opacity-40"
                    >
                      <span className="sm:hidden">+</span>
                      <span className="hidden sm:inline">+ Queue</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="px-2 py-1.5 sm:px-4 sm:py-2 border-t border-neutral-700 text-[10px] sm:text-xs text-neutral-500 truncate">
        {playlist.length} tracks · {formatTotalDuration(totalDurationMs)} total
      </footer>
    </div>
  );
}
