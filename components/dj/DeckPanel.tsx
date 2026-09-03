"use client";

import type { DeckId, DeckSlot } from "@/lib/spotify/djDeckState";
import { formatTrackDuration } from "@/lib/spotify/djDeckState";
import WaveformBar from "@/components/dj/WaveformBar";

export type DeckPanelProps = {
  deckId: DeckId;
  accent: "orange" | "red";
  slot: DeckSlot;
  isActive: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  onPlayPause: () => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  disabled?: boolean;
};

export default function DeckPanel({
  deckId,
  accent,
  slot,
  isActive,
  isPlaying,
  positionMs,
  durationMs,
  onPlayPause,
  volume,
  onVolumeChange,
  disabled = false,
}: DeckPanelProps) {
  const accentText = accent === "orange" ? "text-orange-400" : "text-red-400";
  const accentBorder =
    accent === "orange" ? "border-orange-500/40" : "border-red-500/40";
  const accentBtn =
    accent === "orange"
      ? "bg-orange-600 hover:bg-orange-500"
      : "bg-red-700 hover:bg-red-600";
  const displayDuration =
    isActive && durationMs > 0 ? durationMs : slot.track?.durationMs ?? 0;
  const displayPosition = isActive ? positionMs : 0;

  return (
    <div
      className={`rounded-xl border ${accentBorder} bg-neutral-950/80 p-4 flex flex-col gap-4 min-h-[320px] ${
        isActive ? "ring-1 ring-white/10" : ""
      }`}
    >
      <WaveformBar
        accent={accent}
        positionMs={displayPosition}
        durationMs={displayDuration}
        isActive={isActive}
      />

      <div className="flex gap-4 items-center flex-1">
        <div className="relative shrink-0">
          <div
            className={`w-36 h-36 md:w-44 md:h-44 rounded-full border-4 border-neutral-700 bg-[conic-gradient(from_0deg,#1a1a1a,#2a2a2a,#1a1a1a,#333,#1a1a1a)] flex items-center justify-center shadow-inner ${
              isActive && isPlaying ? "animate-[spin_3s_linear_infinite]" : ""
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-neutral-900 border-2 border-neutral-600 flex items-center justify-center text-lg font-bold text-neutral-300">
              {deckId}
            </div>
          </div>
          {!isActive && slot.track && (
            <span className="absolute -top-2 -right-2 text-[10px] uppercase tracking-wide bg-neutral-800 px-2 py-0.5 rounded border border-neutral-600">
              Cued
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {slot.track ? (
            <>
              <p className={`text-sm font-medium truncate ${accentText}`}>
                {slot.track.primaryArtist}
              </p>
              <p className="text-lg font-semibold text-neutral-100 truncate">
                {slot.track.name}
              </p>
              <p className="text-xs text-neutral-500 font-mono">
                {formatTrackDuration(displayPosition)} /{" "}
                {formatTrackDuration(displayDuration)}
                {slot.track.bpm != null ? ` · ${slot.track.bpm} BPM` : ""}
              </p>
            </>
          ) : (
            <p className="text-neutral-500 text-sm">Load a track from the queue</p>
          )}

          <button
            type="button"
            onClick={onPlayPause}
            disabled={disabled || !slot.track}
            className={`mt-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 ${accentBtn}`}
          >
            {isActive && isPlaying ? "Pause" : "Play"}
          </button>
        </div>

        <div className="hidden sm:flex flex-col items-center gap-2 h-40">
          <span className="text-[10px] uppercase text-neutral-500">Vol</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            disabled={disabled}
            className="h-28 accent-orange-500 [writing-mode:vertical-lr] [direction:rtl]"
            aria-label={`Deck ${deckId} volume`}
          />
        </div>
      </div>
    </div>
  );
}
