import { normalizeIsrc } from "@/lib/musicae/isrc";
import { fetchPlaylistTracksWithPositions } from "@/lib/spotify/client";
import { getMasterPlaylistRefsForGenres } from "@/lib/spotify/masters";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { genreForActivationPosition } from "@/lib/spotify/trackGenre";

const ACTIVATION_GENRES: GenrePool[] = ["cs", "wcs", "ld", "ts", "wz"];

const MASTER_ISRC_GENRE_TTL_MS = 5 * 60 * 1000;
let masterIsrcGenreCache: {
  map: Map<string, GenrePool>;
  expiresAt: number;
} | null = null;

export function invalidateMasterIsrcGenreCache(): void {
  masterIsrcGenreCache = null;
}

export async function getCachedMasterIsrcGenreMap(
  spotifyAccessToken: string,
  options?: { bypassCache?: boolean }
): Promise<Map<string, GenrePool>> {
  const now = Date.now();
  if (
    !options?.bypassCache &&
    masterIsrcGenreCache &&
    masterIsrcGenreCache.expiresAt > now
  ) {
    return masterIsrcGenreCache.map;
  }
  const map = await buildMasterIsrcGenreMap(spotifyAccessToken);
  masterIsrcGenreCache = {
    map,
    expiresAt: now + MASTER_ISRC_GENRE_TTL_MS,
  };
  return map;
}

export async function lookupMasterGenreByIsrc(
  isrc: string,
  spotifyAccessToken: string
): Promise<GenrePool | null> {
  const key = normalizeIsrc(isrc);
  if (!key) return null;
  const map = await getCachedMasterIsrcGenreMap(spotifyAccessToken);
  return map.get(key) ?? null;
}

export async function buildMasterIsrcGenreMap(
  spotifyAccessToken: string
): Promise<Map<string, GenrePool>> {
  const map = new Map<string, GenrePool>();
  const masters = await getMasterPlaylistRefsForGenres(ACTIVATION_GENRES);
  for (const master of masters) {
    const items = await fetchPlaylistTracksWithPositions(
      spotifyAccessToken,
      master.spotifyPlaylistId
    );
    for (const item of items) {
      const isrc = normalizeIsrc(item.track.isrc);
      if (!isrc || map.has(isrc)) continue;
      map.set(isrc, master.genre);
    }
  }
  return map;
}

export function resolveGenreForAppleTrack(input: {
  position: number;
  trackId: string;
  isrc: string | null;
  isrcGenreMap: Map<string, GenrePool>;
  idGenreMap: Map<string, GenrePool>;
  pattern: GenrePool[];
}): GenrePool {
  const normalizedIsrc = input.isrc ? normalizeIsrc(input.isrc) : null;
  const fromIsrc = normalizedIsrc
    ? input.isrcGenreMap.get(normalizedIsrc)
    : undefined;
  if (fromIsrc) return fromIsrc;
  const fromId = input.idGenreMap.get(input.trackId);
  if (fromId) return fromId;
  return genreForActivationPosition(
    input.position,
    input.trackId,
    input.idGenreMap,
    input.pattern
  );
}
