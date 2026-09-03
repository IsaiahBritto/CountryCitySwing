"use client";

import type { CSSProperties } from "react";

const ACCENT_FILL: Record<"orange" | "red" | "neutral", string> = {
  orange: "#ea580c",
  red: "#b91c1c",
  neutral: "#a3a3a3",
};

const THUMB_CLASS: Record<"orange" | "red" | "neutral", string> = {
  orange:
    "[&::-webkit-slider-thumb]:bg-orange-500 [&::-moz-range-thumb]:bg-orange-500",
  red: "[&::-webkit-slider-thumb]:bg-red-600 [&::-moz-range-thumb]:bg-red-600",
  neutral:
    "[&::-webkit-slider-thumb]:bg-neutral-300 [&::-moz-range-thumb]:bg-neutral-300",
};

export type VolumeSliderProps = {
  value: number;
  onChange: (value: number) => void;
  orientation: "horizontal" | "vertical";
  accent: "orange" | "red" | "neutral";
  label?: string;
  disabled?: boolean;
  className?: string;
};

function trackGradient(percent: number, fillColor: string): CSSProperties {
  return {
    background: `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${percent}%, #262626 ${percent}%, #262626 100%)`,
  };
}

function trackGradientVertical(
  percent: number,
  fillColor: string
): CSSProperties {
  return {
    background: `linear-gradient(to top, ${fillColor} 0%, ${fillColor} ${percent}%, #262626 ${percent}%, #262626 100%)`,
  };
}

const THUMB_BASE =
  "appearance-none rounded-full border border-neutral-700 shadow-inner cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-neutral-900 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-neutral-900 [&::-moz-range-thumb]:shadow-md";

export default function VolumeSlider({
  value,
  onChange,
  orientation,
  accent,
  label,
  disabled = false,
  className = "",
}: VolumeSliderProps) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const fillColor = ACCENT_FILL[accent];
  const isVertical = orientation === "vertical";

  const sliderStyle = isVertical
    ? trackGradientVertical(percent, fillColor)
    : trackGradient(percent, fillColor);

  return (
    <div
      className={`flex flex-col items-center gap-1.5 ${
        isVertical ? "h-full" : "w-full"
      } ${className}`}
    >
      {label && (
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">
            {label}
          </span>
          {!isVertical && (
            <span className="text-[10px] tabular-nums text-neutral-400">
              {percent}%
            </span>
          )}
        </div>
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className={`${THUMB_BASE} ${THUMB_CLASS[accent]} ${
          isVertical
            ? "h-28 w-2 [writing-mode:vertical-lr] [direction:rtl]"
            : "h-2 w-full"
        }`}
        style={sliderStyle}
        aria-label={label ?? "Volume"}
      />
      {isVertical && (
        <span className="text-[10px] tabular-nums text-neutral-400">
          {percent}%
        </span>
      )}
    </div>
  );
}
