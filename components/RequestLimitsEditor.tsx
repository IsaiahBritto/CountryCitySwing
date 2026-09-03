"use client";

import {
  ALL_GENRES,
  GENRE_LABELS,
  defaultRequestLimits,
  type RequestLimits,
} from "@/lib/spotify/requestLimits";
import type { GenrePool } from "@/lib/spotify/playlistIds";

export type RequestLimitsDraft = Record<GenrePool, string>;

export function limitsToDraft(
  limits: RequestLimits | null,
  availableGenres: GenrePool[]
): RequestLimitsDraft {
  const draft = {} as RequestLimitsDraft;
  for (const genre of ALL_GENRES) {
    draft[genre] = "";
  }
  for (const genre of availableGenres) {
    const value = limits?.[genre];
    draft[genre] = value == null ? "1" : String(value);
  }
  return draft;
}

export function draftToLimits(
  draft: RequestLimitsDraft,
  availableGenres: GenrePool[]
): RequestLimits {
  const limits: RequestLimits = {};
  for (const genre of availableGenres) {
    const raw = draft[genre]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 10) {
      limits[genre] = n;
    }
  }
  return limits;
}

type RequestLimitsEditorProps = {
  availableGenres: GenrePool[];
  draft: RequestLimitsDraft;
  onChange: (draft: RequestLimitsDraft) => void;
  disabled?: boolean;
};

export function RequestLimitsEditor({
  availableGenres,
  draft,
  onChange,
  disabled,
}: RequestLimitsEditorProps) {
  const setGenre = (genre: GenrePool, value: string) => {
    onChange({ ...draft, [genre]: value });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Max requests per person per genre tonight. Blank = unlimited. 0 =
        disabled.
      </p>
      <ul className="space-y-2">
        {availableGenres.map((genre) => (
          <li
            key={genre}
            className="flex flex-wrap items-center justify-between gap-2 rounded bg-neutral-800/60 px-3 py-2"
          >
            <span className="text-sm text-gray-200">{GENRE_LABELS[genre]}</span>
            <input
              type="number"
              min={0}
              max={10}
              value={draft[genre] ?? ""}
              onChange={(e) => setGenre(genre, e.target.value)}
              placeholder="Unlimited"
              disabled={disabled}
              className="w-24 rounded bg-neutral-900 border border-neutral-600 px-2 py-1 text-sm text-right"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export { defaultRequestLimits };
