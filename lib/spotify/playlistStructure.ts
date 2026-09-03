import type { GenrePool } from "@/lib/spotify/playlistIds";

export type PlaylistSegment = { genre: GenrePool; count: number };

export type PlaylistStructure = { segments: PlaylistSegment[] };

export const DEFAULT_SOCIAL_STRUCTURE: PlaylistStructure = {
  segments: [
    { genre: "cs", count: 2 },
    { genre: "wcs", count: 2 },
    { genre: "ld", count: 2 },
  ],
};

export const DEFAULT_DURATION_MINUTES = 330;
export const MIN_DURATION_MINUTES = 30;
export const MAX_DURATION_MINUTES = 480;
export const DURATION_STEP_MINUTES = 30;
export const MAX_SEGMENT_COUNT = 6;

export function expandStructure(structure: PlaylistStructure): GenrePool[] {
  const pattern: GenrePool[] = [];
  for (const segment of structure.segments) {
    for (let i = 0; i < segment.count; i++) {
      pattern.push(segment.genre);
    }
  }
  return pattern;
}

export function structureAvailableGenres(
  structure: PlaylistStructure
): GenrePool[] {
  return [...new Set(structure.segments.map((s) => s.genre))];
}

export function parsePlaylistStructure(raw: unknown): PlaylistStructure | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const segmentsRaw = (raw as { segments?: unknown }).segments;
  if (!Array.isArray(segmentsRaw) || segmentsRaw.length === 0) return null;

  const segments: PlaylistSegment[] = [];
  for (const item of segmentsRaw) {
    if (!item || typeof item !== "object") return null;
    const genre = (item as PlaylistSegment).genre;
    const count = (item as PlaylistSegment).count;
    if (
      genre !== "cs" &&
      genre !== "wcs" &&
      genre !== "ld" &&
      genre !== "ts"
    ) {
      return null;
    }
    if (
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_SEGMENT_COUNT
    ) {
      return null;
    }
    segments.push({ genre, count });
  }
  return { segments };
}

export function validateDurationMinutes(minutes: number): number {
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_DURATION_MINUTES ||
    minutes > MAX_DURATION_MINUTES ||
    minutes % DURATION_STEP_MINUTES !== 0
  ) {
    throw new Error(
      `Duration must be ${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES} minutes in ${DURATION_STEP_MINUTES}-minute steps`
    );
  }
  return minutes;
}

export function validatePlaylistStructure(
  structure: PlaylistStructure
): PlaylistStructure {
  if (!structure.segments.length) {
    throw new Error("Playlist structure must have at least one segment");
  }
  for (const segment of structure.segments) {
    if (
      !Number.isInteger(segment.count) ||
      segment.count < 1 ||
      segment.count > MAX_SEGMENT_COUNT
    ) {
      throw new Error(
        `Each segment count must be 1–${MAX_SEGMENT_COUNT}`
      );
    }
  }
  return structure;
}

export function resolvePlaylistStructure(
  raw: unknown
): PlaylistStructure {
  const parsed = parsePlaylistStructure(raw);
  if (!parsed) {
    throw new Error("Invalid playlist structure");
  }
  return validatePlaylistStructure(parsed);
}

export function structureDescription(structure: PlaylistStructure): string {
  return structure.segments
    .map((s) => `${s.count} ${s.genre.toUpperCase()}`)
    .join(" / ");
}

export function cycleLength(pattern: GenrePool[]): number {
  return pattern.length;
}

/** Walk backward within cycle to find contiguous block start for genre at index. */
export function genreBlockStart(
  index: number,
  genre: GenrePool,
  pattern: GenrePool[]
): number | null {
  if (index < 0 || pattern.length === 0) return null;
  const cycleLen = pattern.length;
  const phase = index % cycleLen;
  if (pattern[phase] !== genre) return null;

  let blockStartInCycle = phase;
  while (
    blockStartInCycle > 0 &&
    pattern[blockStartInCycle - 1] === genre
  ) {
    blockStartInCycle--;
  }
  return index - phase + blockStartInCycle;
}

export function genreBlockLength(
  blockStartInCycle: number,
  pattern: GenrePool[]
): number {
  const genre = pattern[blockStartInCycle];
  let len = 0;
  for (let i = blockStartInCycle; i < pattern.length; i++) {
    if (pattern[i] !== genre) break;
    len++;
  }
  return len;
}

/** All genre block starts for a given genre within one cycle. */
export function genreBlockStartsInCycle(
  genre: GenrePool,
  pattern: GenrePool[]
): number[] {
  const starts: number[] = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === genre) {
      starts.push(i);
      while (i < pattern.length && pattern[i] === genre) i++;
    } else {
      i++;
    }
  }
  return starts;
}

export function getDefaultPattern(): GenrePool[] {
  return expandStructure(DEFAULT_SOCIAL_STRUCTURE);
}

export function getDefaultTargetDurationMs(): number {
  return DEFAULT_DURATION_MINUTES * 60 * 1000;
}
