import {
  DEFAULT_SOCIAL_STRUCTURE,
  expandStructure,
  getDefaultPattern,
  parsePlaylistStructure,
  structureAvailableGenres,
  validatePlaylistStructure,
  type PlaylistStructure,
} from "@/lib/spotify/playlistStructure";
import type { GenrePool } from "@/lib/spotify/playlistIds";

export type RequestLimits = Partial<Record<GenrePool, number>>;

export const ALL_GENRES: GenrePool[] = ["cs", "wcs", "ld", "ts"];

export const GENRE_LABELS: Record<GenrePool, string> = {
  cs: "Country Swing",
  wcs: "West Coast Swing",
  ld: "Line Dance",
  ts: "Two Step",
};

const MAX_LIMIT = 10;

/** Genres available for requests on the active playlist (legacy: default 2-2-2 pattern). */
export function getLegacyAvailableGenres(): GenrePool[] {
  return structureAvailableGenres(DEFAULT_SOCIAL_STRUCTURE);
}

export function availableGenresFromStructure(
  structure: PlaylistStructure | null
): GenrePool[] {
  if (!structure) return getLegacyAvailableGenres();
  return structureAvailableGenres(structure);
}

export function parseRequestLimits(raw: unknown): RequestLimits | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const out: RequestLimits = {};
  for (const genre of ALL_GENRES) {
    const value = (raw as Record<string, unknown>)[genre];
    if (value == null || value === "") continue;
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    out[genre] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function defaultRequestLimits(
  availableGenres: GenrePool[]
): RequestLimits {
  const limits: RequestLimits = {};
  for (const genre of availableGenres) {
    limits[genre] = 1;
  }
  return limits;
}

export function validateRequestLimits(
  limits: RequestLimits,
  availableGenres: GenrePool[]
): RequestLimits {
  const out: RequestLimits = {};
  for (const genre of availableGenres) {
    const value = limits[genre];
    if (value == null) continue;
    if (!Number.isInteger(value) || value < 0 || value > MAX_LIMIT) {
      throw new Error(
        `${GENRE_LABELS[genre]} limit must be 0–${MAX_LIMIT} or blank for unlimited`
      );
    }
    out[genre] = value;
  }
  return out;
}

export function getLimitForGenre(
  limits: RequestLimits | null,
  genre: GenrePool
): number | null {
  if (!limits) return null;
  const value = limits[genre];
  if (value == null) return null;
  return value;
}

export {
  parsePlaylistStructure,
  validatePlaylistStructure,
  expandStructure,
  getDefaultPattern,
  DEFAULT_SOCIAL_STRUCTURE,
  type PlaylistStructure,
};
