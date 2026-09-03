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

export type FadeSliderProps = {
  value: number;
  onChange: (seconds: number) => void;
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

function formatFadeLabel(seconds: number): string {
  if (seconds === 0) return "0s";
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

export default function FadeSlider({
  value,
  onChange,
  orientation,
  accent,
  label,
  disabled = false,
  className = "",
}: FadeSliderProps) {
  const fillColor = ACCENT_FILL[accent];
  const isVertical = orientation === "vertical";
  const stepIndex = Math.round(value * 2);
  const percent = Math.round((stepIndex / 20) * 100);
  const display = formatFadeLabel(value);

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
              {display}
            </span>
          )}
        </div>
      )}
      <input
        type="range"
        min={0}
        max={20}
        step={1}
        value={stepIndex}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 2)}
        className={`${THUMB_BASE} ${THUMB_CLASS[accent]} ${
          isVertical
            ? "h-28 w-2 [writing-mode:vertical-lr] [direction:rtl]"
            : "h-2 w-full"
        }`}
        style={sliderStyle}
        aria-label={label ?? "Crossfade duration"}
      />
      {isVertical && (
        <span className="text-[10px] tabular-nums text-neutral-400">
          {display}
        </span>
      )}
    </div>
  );
}
