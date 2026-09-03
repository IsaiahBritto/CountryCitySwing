"use client";

import { useMemo } from "react";
import {
  DEFAULT_DURATION_MINUTES,
  DEFAULT_SOCIAL_STRUCTURE,
  DURATION_STEP_MINUTES,
  MAX_DURATION_MINUTES,
  MAX_SEGMENT_COUNT,
  MIN_DURATION_MINUTES,
  structureDescription,
  type PlaylistSegment,
  type PlaylistStructure,
} from "@/lib/spotify/playlistStructure";
import { GENRE_LABELS } from "@/lib/spotify/requestLimits";
import type { GenrePool } from "@/lib/spotify/playlistIds";

const ALL_GENRE_OPTIONS: { value: GenrePool; label: string }[] = [
  { value: "cs", label: GENRE_LABELS.cs },
  { value: "wcs", label: GENRE_LABELS.wcs },
  { value: "ld", label: GENRE_LABELS.ld },
  { value: "ts", label: GENRE_LABELS.ts },
];

const DURATION_OPTIONS = Array.from(
  {
    length:
      (MAX_DURATION_MINUTES - MIN_DURATION_MINUTES) / DURATION_STEP_MINUTES + 1,
  },
  (_, i) => MIN_DURATION_MINUTES + i * DURATION_STEP_MINUTES
);

export type PlaylistBuilderState = {
  durationMinutes: number;
  structure: PlaylistStructure;
};

export function defaultBuilderState(): PlaylistBuilderState {
  return {
    durationMinutes: DEFAULT_DURATION_MINUTES,
    structure: {
      segments: DEFAULT_SOCIAL_STRUCTURE.segments.map((s) => ({ ...s })),
    },
  };
}

type PlaylistStructureBuilderProps = {
  value: PlaylistBuilderState;
  onChange: (value: PlaylistBuilderState) => void;
  disabled?: boolean;
};

function segmentLabel(segment: PlaylistSegment): string {
  return `${segment.count} ${GENRE_LABELS[segment.genre]}`;
}

export default function PlaylistStructureBuilder({
  value,
  onChange,
  disabled,
}: PlaylistStructureBuilderProps) {
  const preview = useMemo(() => {
    const parts = value.structure.segments.map(segmentLabel).join(" → ");
    return `Repeats: ${parts} (~${value.durationMinutes} min)`;
  }, [value.durationMinutes, value.structure.segments]);

  const updateSegment = (index: number, patch: Partial<PlaylistSegment>) => {
    const segments = value.structure.segments.map((s, i) =>
      i === index ? { ...s, ...patch } : s
    );
    onChange({ ...value, structure: { segments } });
  };

  const moveSegment = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    const segments = [...value.structure.segments];
    if (next < 0 || next >= segments.length) return;
    [segments[index], segments[next]] = [segments[next], segments[index]];
    onChange({ ...value, structure: { segments } });
  };

  const removeSegment = (index: number) => {
    if (value.structure.segments.length <= 1) return;
    const segments = value.structure.segments.filter((_, i) => i !== index);
    onChange({ ...value, structure: { segments } });
  };

  const addSegment = (genre: GenrePool) => {
    onChange({
      ...value,
      structure: {
        segments: [...value.structure.segments, { genre, count: 2 }],
      },
    });
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm text-gray-400">Duration</span>
        <select
          value={value.durationMinutes}
          onChange={(e) =>
            onChange({
              ...value,
              durationMinutes: Number(e.target.value),
            })
          }
          disabled={disabled}
          className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2 text-sm"
        >
          {DURATION_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m < 60
                ? `${m} min`
                : `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim()}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <span className="text-sm text-gray-400">Section pattern (repeats)</span>
        <ul className="space-y-2">
          {value.structure.segments.map((segment, index) => (
            <li
              key={`${segment.genre}-${index}`}
              className="flex flex-wrap items-center gap-2 rounded bg-neutral-800/60 px-3 py-2"
            >
              <select
                value={segment.genre}
                onChange={(e) =>
                  updateSegment(index, {
                    genre: e.target.value as GenrePool,
                  })
                }
                disabled={disabled}
                className="rounded bg-neutral-900 border border-neutral-600 px-2 py-1 text-sm"
              >
                {ALL_GENRE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-sm text-gray-300">
                Count
                <input
                  type="number"
                  min={1}
                  max={MAX_SEGMENT_COUNT}
                  value={segment.count}
                  onChange={(e) =>
                    updateSegment(index, {
                      count: Math.min(
                        MAX_SEGMENT_COUNT,
                        Math.max(1, Number(e.target.value) || 1)
                      ),
                    })
                  }
                  disabled={disabled}
                  className="w-16 rounded bg-neutral-900 border border-neutral-600 px-2 py-1 text-sm text-right"
                />
              </label>
              <div className="flex gap-1 ml-auto">
                <button
                  type="button"
                  onClick={() => moveSegment(index, -1)}
                  disabled={disabled || index === 0}
                  className="px-2 py-1 text-xs border border-neutral-600 rounded disabled:opacity-40"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => moveSegment(index, 1)}
                  disabled={
                    disabled || index === value.structure.segments.length - 1
                  }
                  className="px-2 py-1 text-xs border border-neutral-600 rounded disabled:opacity-40"
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => removeSegment(index)}
                  disabled={disabled || value.structure.segments.length <= 1}
                  className="px-2 py-1 text-xs border border-red-800/60 text-red-300 rounded disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {ALL_GENRE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => addSegment(opt.value)}
              disabled={disabled}
              className="px-2 py-1 text-xs rounded border border-neutral-600 hover:border-amber-600/50 disabled:opacity-40"
            >
              + {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">{preview}</p>
      </div>
    </div>
  );
}
