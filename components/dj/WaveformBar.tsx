"use client";

import { formatTrackDuration } from "@/lib/spotify/djDeckState";

type WaveformBarProps = {
  accent: "orange" | "red";
  positionMs: number;
  durationMs: number;
  isActive: boolean;
};

export default function WaveformBar({
  accent,
  positionMs,
  durationMs,
  isActive,
}: WaveformBarProps) {
  const progress =
    durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;
  const gradient =
    accent === "orange"
      ? "from-orange-600 to-amber-400"
      : "from-red-700 to-orange-500";

  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${gradient} transition-[width] duration-300 ${
            isActive ? "opacity-100" : "opacity-40"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
        <span>{formatTrackDuration(positionMs)}</span>
        <span>{formatTrackDuration(durationMs)}</span>
      </div>
    </div>
  );
}
