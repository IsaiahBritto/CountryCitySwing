"use client";

import { useCallback, useRef, type ReactNode } from "react";
import {
  BackwardIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import type { DeckId, DeckTrack } from "@/lib/spotify/djDeckState";
import { formatTrackDuration } from "@/lib/spotify/djDeckState";
import WaveformBar from "@/components/dj/WaveformBar";
import FadeSlider from "@/components/dj/FadeSlider";
import VolumeSlider from "@/components/dj/VolumeSlider";

const BACK_DOUBLE_TAP_MS = 350;

export type DeckPanelProps = {
  deckId: DeckId;
  accent: "orange" | "red";
  playlistName: string | null;
  track: DeckTrack | null;
  upNext: DeckTrack | null;
  isActive: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  onPlayPause: () => void;
  onRestartTrack: () => void;
  onPreviousTrack: () => void;
  onSkipCurrent: () => void;
  onSkipUpNext: () => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  crossfadeSeconds: number;
  onCrossfadeChange: (seconds: number) => void;
  disabled?: boolean;
  playlistSelector?: ReactNode;
};

export default function DeckPanel({
  deckId,
  accent,
  playlistName,
  track,
  upNext,
  isActive,
  isPlaying,
  positionMs,
  durationMs,
  onPlayPause,
  onRestartTrack,
  onPreviousTrack,
  onSkipCurrent,
  onSkipUpNext,
  volume,
  onVolumeChange,
  crossfadeSeconds,
  onCrossfadeChange,
  disabled = false,
  playlistSelector,
}: DeckPanelProps) {
  const accentText = accent === "orange" ? "text-orange-400" : "text-red-400";
  const accentBorder =
    accent === "orange" ? "border-orange-500/40" : "border-red-500/40";
  const accentBtn =
    accent === "orange"
      ? "bg-orange-600 hover:bg-orange-500"
      : "bg-red-700 hover:bg-red-600";
  const accentMuted =
    accent === "orange"
      ? "border-orange-500/30 text-orange-300 hover:bg-orange-950/50"
      : "border-red-500/30 text-red-300 hover:bg-red-950/50";
  const deckPill =
    accent === "orange"
      ? "bg-orange-600/20 text-orange-300 border-orange-500/40"
      : "bg-red-900/30 text-red-300 border-red-500/40";

  const lastBackTapRef = useRef(0);
  const backSingleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleBackClick = useCallback(() => {
    const now = Date.now();
    if (now - lastBackTapRef.current < BACK_DOUBLE_TAP_MS) {
      if (backSingleTapTimerRef.current) {
        clearTimeout(backSingleTapTimerRef.current);
        backSingleTapTimerRef.current = null;
      }
      lastBackTapRef.current = 0;
      onPreviousTrack();
      return;
    }

    lastBackTapRef.current = now;
    if (backSingleTapTimerRef.current) {
      clearTimeout(backSingleTapTimerRef.current);
    }
    backSingleTapTimerRef.current = setTimeout(() => {
      backSingleTapTimerRef.current = null;
      onRestartTrack();
    }, BACK_DOUBLE_TAP_MS);
  }, [onPreviousTrack, onRestartTrack]);

  const displayDuration =
    durationMs > 0 ? durationMs : track?.durationMs ?? 0;
  const displayPosition = positionMs;

  const iconBtnClass = `p-1.5 sm:p-2.5 rounded-full border disabled:opacity-40 transition-colors ${accentMuted}`;

  return (
    <div
      className={`rounded-xl border ${accentBorder} bg-neutral-950/80 p-2 sm:p-4 flex flex-col gap-2 sm:gap-4 min-w-0 min-h-0 sm:min-h-[320px] ${
        isActive ? "ring-1 ring-white/10" : ""
      }`}
    >
      {playlistSelector && <div className="min-w-0">{playlistSelector}</div>}

      <div className="sm:hidden flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-bold ${deckPill}`}
        >
          {deckId}
        </span>
        {track && (
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">
            {isActive && isPlaying ? "Playing" : "Paused"}
          </span>
        )}
      </div>

      <WaveformBar
        accent={accent}
        positionMs={displayPosition}
        durationMs={displayDuration}
        isActive={isActive}
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center flex-1 min-w-0">
        <div className="relative shrink-0 hidden sm:block">
          <div
            className={`w-36 h-36 md:w-44 md:h-44 rounded-full border-4 border-neutral-700 bg-[conic-gradient(from_0deg,#1a1a1a,#2a2a2a,#1a1a1a,#333,#1a1a1a)] flex items-center justify-center shadow-inner ${
              isActive && isPlaying ? "animate-[spin_3s_linear_infinite]" : ""
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-neutral-900 border-2 border-neutral-600 flex items-center justify-center text-lg font-bold text-neutral-300">
              {deckId}
            </div>
          </div>
          {!isActive && track && (
            <span className="absolute -top-2 -right-2 text-[10px] uppercase tracking-wide bg-neutral-800 px-2 py-0.5 rounded border border-neutral-600">
              Paused
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1 sm:space-y-2">
          {playlistName && (
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 truncate">
              {playlistName}
            </p>
          )}
          {track ? (
            <>
              <p className={`text-xs sm:text-sm font-medium truncate ${accentText}`}>
                {track.primaryArtist}
              </p>
              <p className="text-sm sm:text-lg font-semibold text-neutral-100 truncate">
                {track.name}
              </p>
              <p className="text-[10px] sm:text-xs text-neutral-500 font-mono">
                {formatTrackDuration(displayPosition)} /{" "}
                {formatTrackDuration(displayDuration)}
                {track.bpm != null && isActive ? (
                  <span className="hidden sm:inline"> · {track.bpm} BPM</span>
                ) : null}
              </p>
            </>
          ) : (
            <p className="text-neutral-500 text-xs sm:text-sm">
              Select a playlist
            </p>
          )}

          <div className="flex items-center justify-center gap-2 sm:gap-3 mt-1 sm:mt-3">
            <button
              type="button"
              onClick={handleBackClick}
              disabled={disabled || !track}
              className={iconBtnClass}
              aria-label="Restart track (double-tap for previous)"
            >
              <BackwardIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              type="button"
              onClick={onPlayPause}
              disabled={disabled || !track}
              className={`p-2 sm:p-3 rounded-full text-white disabled:opacity-40 transition-colors ${accentBtn}`}
              aria-label={isActive && isPlaying ? "Pause" : "Play"}
            >
              {isActive && isPlaying ? (
                <PauseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </button>
            <button
              type="button"
              onClick={onSkipCurrent}
              disabled={disabled || !track}
              className={iconBtnClass}
              aria-label="Next track"
            >
              <ForwardIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          <FadeSlider
            label="Fade"
            orientation="horizontal"
            accent={accent}
            value={crossfadeSeconds}
            onChange={onCrossfadeChange}
            disabled={disabled}
            className="mt-1 sm:mt-2 w-full"
          />

          <div className="sm:hidden">
            <VolumeSlider
              label="Vol"
              orientation="horizontal"
              accent={accent}
              value={volume}
              onChange={onVolumeChange}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-center justify-center h-40 shrink-0">
          <VolumeSlider
            label="Vol"
            orientation="vertical"
            accent={accent}
            value={volume}
            onChange={onVolumeChange}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 pt-2 border-t border-neutral-800 text-[10px] sm:text-xs text-neutral-500 min-w-0">
        {upNext ? (
          <p className="truncate min-w-0">
            Up next:{" "}
            <span className="text-neutral-400">
              {upNext.primaryArtist} — {upNext.name}
            </span>
          </p>
        ) : (
          <p className="text-neutral-600">No upcoming tracks</p>
        )}
        <button
          type="button"
          onClick={onSkipUpNext}
          disabled={disabled || !upNext}
          className={`shrink-0 self-end sm:self-auto px-2 py-1 rounded border text-[10px] font-semibold disabled:opacity-40 ${accentMuted}`}
          aria-label={
            upNext ? `Skip up next: ${upNext.name}` : "No up next track"
          }
        >
          <span className="sm:hidden">Skip</span>
          <span className="hidden sm:inline">Skip →</span>
        </button>
      </div>
    </div>
  );
}
