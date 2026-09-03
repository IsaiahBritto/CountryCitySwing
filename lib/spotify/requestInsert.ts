import type { GenrePool } from "@/lib/spotify/playlistIds";
import {
  cycleLength,
  genreBlockLength,
  genreBlockStart,
  genreBlockStartsInCycle,
  getDefaultPattern,
} from "@/lib/spotify/playlistStructure";

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
 * Start of the genre block that contains `index` within the repeating pattern.
 */
export function genreSetStart(
  index: number,
  genre: GenrePool,
  pattern: GenrePool[] = getDefaultPattern()
): number | null {
  return genreBlockStart(index, genre, pattern);
}

/**
 * If currently inside a genre block, search after that block ends.
 * Otherwise search after currentIndex.
 */
export function searchStartIndex(
  currentIndex: number,
  genre: GenrePool,
  trackCount: number,
  pattern: GenrePool[] = getDefaultPattern()
): number {
  if (currentIndex < 0) return 0;

  const setStart = genreBlockStart(currentIndex, genre, pattern);
  if (setStart != null) {
    const cycleLen = pattern.length;
    const cycleStart = currentIndex - (currentIndex % cycleLen);
    const blockStartInCycle = setStart - cycleStart;
    const len = genreBlockLength(blockStartInCycle, pattern);
    return setStart + len;
  }

  return Math.min(currentIndex + 1, trackCount);
}

/**
 * Walk genre blocks after `fromIndex` and return the first track still marked generated.
 */
export function findRequestInsertTarget(
  tracks: SnapshotTrack[],
  currentIndex: number,
  genre: GenrePool,
  pattern: GenrePool[] = getDefaultPattern()
): InsertTarget {
  const cycleLen = cycleLength(pattern);
  if (cycleLen === 0) return { kind: "append" };

  const patternedCount =
    Math.floor(tracks.length / cycleLen) * cycleLen;
  const from = searchStartIndex(currentIndex, genre, patternedCount, pattern);

  for (
    let cycleStart = 0;
    cycleStart < patternedCount;
    cycleStart += cycleLen
  ) {
    for (const blockStartInCycle of genreBlockStartsInCycle(genre, pattern)) {
      const setStart = cycleStart + blockStartInCycle;
      if (setStart < from) continue;

      const blockLen = genreBlockLength(blockStartInCycle, pattern);
      for (let offset = 0; offset < blockLen; offset++) {
        const pos = setStart + offset;
        if (pos >= patternedCount) continue;
        const track = tracks[pos];
        if (!track) continue;
        if (
          track.genre !== genre &&
          pattern[pos % cycleLen] !== genre
        ) {
          continue;
        }
        if (track.source === "generated") {
          return { kind: "replace", position: pos };
        }
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
