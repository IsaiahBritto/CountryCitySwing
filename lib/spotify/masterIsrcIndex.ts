import { normalizeIsrc } from "@/lib/musicae/isrc";
import type { SpotifyTrack } from "@/lib/spotify/client";

export type PlaylistTrackAtPosition = {
  track: SpotifyTrack;
  position: number;
};

export type IsrcDuplicateScan = {
  scanned: number;
  groupsWithDuplicates: number;
  removed: number;
  skippedNoIsrc: number;
  removedTrackIds: string[];
};

/** First playlist position wins for each normalized ISRC. */
export function buildCanonicalTrackByIsrc(
  items: PlaylistTrackAtPosition[]
): Map<string, SpotifyTrack> {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const map = new Map<string, SpotifyTrack>();
  for (const { track } of sorted) {
    const key = normalizeIsrc(track.isrc);
    if (!key || map.has(key)) continue;
    map.set(key, track);
  }
  return map;
}

export function collectIsrcDuplicateRemovals(
  items: PlaylistTrackAtPosition[]
): IsrcDuplicateScan & {
  removals: Array<{ uri: string; position: number }>;
} {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const keptByIsrc = new Set<string>();
  const duplicateGroups = new Set<string>();
  const removals: Array<{ uri: string; position: number }> = [];
  const removedTrackIds: string[] = [];
  let skippedNoIsrc = 0;

  for (const { track, position } of sorted) {
    const key = normalizeIsrc(track.isrc);
    if (!key) {
      skippedNoIsrc += 1;
      continue;
    }
    if (!keptByIsrc.has(key)) {
      keptByIsrc.add(key);
      continue;
    }
    duplicateGroups.add(key);
    removals.push({ uri: track.uri, position });
    removedTrackIds.push(track.id);
  }

  return {
    scanned: items.length,
    groupsWithDuplicates: duplicateGroups.size,
    removed: removals.length,
    skippedNoIsrc,
    removedTrackIds,
    removals,
  };
}
