import type { GenrePool } from "@/lib/spotify/playlistIds";
import {
  cycleLength,
  genreBlockLength,
  genreBlockStart,
  genreBlockStartsInCycle,
  getDefaultPattern,
} from "@/lib/spotify/playlistStructure";
import {
  deckRowStatusForTrack,
  isTrackOnDeck,
  type LivePlaylistView,
} from "@/lib/spotify/requestLiveView";

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

export type ExistingTrackAction =
  | { kind: "not_in_live_playlist" }
  | { kind: "already_played" }
  | { kind: "now_playing" }
  | { kind: "already_queued" }
  | { kind: "swap"; from: number; to: number };

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

/**
 * Snapshot index for genre-slot targeting. Prefers deck now-playing when available.
 */
export function resolveInsertPlayheadIndex(
  tracks: SnapshotTrack[],
  liveView: LivePlaylistView,
  spotifyPlayheadIndex: number
): number {
  if (liveView.deckAuthority === "social_deck" && liveView.currentTrackId) {
    const index = tracks.findIndex(
      (t) => t.spotifyTrackId === liveView.currentTrackId
    );
    return index >= 0 ? index : -1;
  }
  return spotifyPlayheadIndex;
}

function resolveSwapOrQueued(
  tracks: SnapshotTrack[],
  from: number,
  currentIndex: number,
  genre: GenrePool,
  pattern: GenrePool[]
): ExistingTrackAction {
  const target = findRequestInsertTarget(tracks, currentIndex, genre, pattern);
  if (target.kind === "replace" && from > target.position) {
    return { kind: "swap", from, to: target.position };
  }
  return { kind: "already_queued" };
}

/**
 * Decide what to do when the requested track is already in the snapshot.
 */
export function resolveExistingTrackAction(
  tracks: SnapshotTrack[],
  trackId: string,
  currentIndex: number,
  genre: GenrePool,
  liveView: LivePlaylistView,
  pattern: GenrePool[] = getDefaultPattern(),
  fallbackNowPlayingTrackId: string | null = null
): ExistingTrackAction {
  const existing = tracks.find((t) => t.spotifyTrackId === trackId);
  if (!existing) return { kind: "already_queued" };

  const from = existing.position;

  if (liveView.deckAuthority === "social_deck") {
    if (!isTrackOnDeck(liveView, trackId)) {
      return { kind: "not_in_live_playlist" };
    }

    const rowStatus = deckRowStatusForTrack(liveView, trackId);
    if (rowStatus === "current") {
      return { kind: "now_playing" };
    }
    if (rowStatus === "played") {
      return { kind: "already_played" };
    }
    return resolveSwapOrQueued(tracks, from, currentIndex, genre, pattern);
  }

  // Fallback: no position-based played; only explicit now-playing match.
  if (
    fallbackNowPlayingTrackId &&
    fallbackNowPlayingTrackId === trackId
  ) {
    return { kind: "now_playing" };
  }

  return resolveSwapOrQueued(tracks, from, currentIndex, genre, pattern);
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
