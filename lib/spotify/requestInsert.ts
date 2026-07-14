import { SET_PATTERN } from "@/lib/spotify/curate";
import type { GenrePool } from "@/lib/spotify/playlistIds";

export type SnapshotTrackSource = "generated" | "request";

export type SnapshotTrack = {
  position: number;
  spotifyTrackId: string;
  uri: string;
  name: string;
  primaryArtist: string;
  genre: GenrePool;
  source: SnapshotTrackSource;
};

export type InsertTarget =
  | { kind: "replace"; position: number }
  | { kind: "append" };

/**
 * Start of the genre set that contains `index` within the repeating 2-2-2 pattern.
 * Returns null if the track at `index` is outside patterned length (e.g. appends).
 */
export function genreSetStart(index: number, genre: GenrePool): number | null {
  if (index < 0) return null;
  const phase = index % SET_PATTERN.length;
  if (SET_PATTERN[phase] !== genre) return null;
  // Each genre occupies a contiguous pair: cs@0-1, wcs@2-3, ld@4-5
  const pairStartInCycle = SET_PATTERN.indexOf(genre);
  const cycleStart = index - phase;
  return cycleStart + pairStartInCycle;
}

/**
 * If currently inside a G set, search after that set ends.
 * Otherwise search after currentIndex.
 */
export function searchStartIndex(
  currentIndex: number,
  genre: GenrePool,
  trackCount: number
): number {
  if (currentIndex < 0) return 0;

  const setStart = genreSetStart(currentIndex, genre);
  if (setStart != null) {
    return setStart + 2; // after the two-song set
  }

  return Math.min(currentIndex + 1, trackCount);
}

/**
 * Walk G sets after `fromIndex` and return the first track still marked generated.
 * Falls back to append when no eligible slot remains.
 *
 * Only considers patterned positions (length multiple of 6). Appended tail tracks
 * after the last full cycle are not treated as replaceable set slots.
 */
export function findRequestInsertTarget(
  tracks: SnapshotTrack[],
  currentIndex: number,
  genre: GenrePool
): InsertTarget {
  const patternedCount =
    Math.floor(tracks.length / SET_PATTERN.length) * SET_PATTERN.length;
  const from = searchStartIndex(currentIndex, genre, patternedCount);

  for (
    let cycleStart = 0;
    cycleStart < patternedCount;
    cycleStart += SET_PATTERN.length
  ) {
    const pairStartInCycle = SET_PATTERN.indexOf(genre);
    const setStart = cycleStart + pairStartInCycle;
    if (setStart < from) continue;

    for (let offset = 0; offset < 2; offset++) {
      const pos = setStart + offset;
      if (pos >= patternedCount) continue;
      const track = tracks[pos];
      if (!track) continue;
      // Prefer stored genre, but also accept pattern-aligned slots
      if (track.genre !== genre && SET_PATTERN[pos % SET_PATTERN.length] !== genre) {
        continue;
      }
      if (track.source === "generated") {
        return { kind: "replace", position: pos };
      }
    }
  }

  return { kind: "append" };
}

export function resolvePlaybackIndex(
  tracks: SnapshotTrack[],
  playing: { trackId: string | null; trackUri: string | null } | null,
  contextPlaylistId: string | null | undefined,
  activePlaylistId: string
): number {
  if (!playing?.trackId && !playing?.trackUri) return -1;

  if (contextPlaylistId && contextPlaylistId !== activePlaylistId) {
    return -1;
  }

  // Prefer the first occurrence at or matching the playhead; for duplicates use earliest.
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (playing.trackId && t.spotifyTrackId === playing.trackId) return i;
    if (playing.trackUri && t.uri === playing.trackUri) return i;
  }
  return -1;
}

export function parsePlaylistIdFromContextUri(
  contextUri: string | null | undefined
): string | null {
  if (!contextUri) return null;
  const match = contextUri.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  return match?.[1] ?? null;
}
