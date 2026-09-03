"use client";

import type { DeckId } from "@/lib/spotify/djDeckState";
import VolumeSlider from "@/components/dj/VolumeSlider";

export type MixerBarProps = {
  activeDeck: DeckId;
  onActiveDeckChange: (deck: DeckId) => void;
  secondDeckEnabled: boolean;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  disabled?: boolean;
};

export default function MixerBar({
  activeDeck,
  onActiveDeckChange,
  secondDeckEnabled,
  masterVolume,
  onMasterVolumeChange,
  disabled = false,
}: MixerBarProps) {
  return (
    <div className="flex flex-col items-center gap-2 sm:gap-4 w-full max-w-full sm:max-w-xs mx-auto px-2 sm:px-4 py-1 sm:py-2">
      <VolumeSlider
        label="Master"
        orientation="horizontal"
        accent="neutral"
        value={masterVolume}
        onChange={onMasterVolumeChange}
        disabled={disabled}
      />

      {secondDeckEnabled && (
        <div className="w-full space-y-1 sm:space-y-2">
          <div className="text-[10px] text-neutral-500 uppercase text-center">
            Active player
          </div>
          <div className="flex rounded-lg overflow-hidden border border-neutral-700">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onActiveDeckChange("A")}
              className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold transition-colors disabled:opacity-40 ${
                activeDeck === "A"
                  ? "bg-orange-600 text-white"
                  : "bg-neutral-900 text-orange-400/70 hover:bg-neutral-800"
              }`}
            >
              A
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onActiveDeckChange("B")}
              className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold transition-colors disabled:opacity-40 ${
                activeDeck === "B"
                  ? "bg-red-700 text-white"
                  : "bg-neutral-900 text-red-400/70 hover:bg-neutral-800"
              }`}
            >
              B
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
