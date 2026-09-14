import type { GenrePool } from "@/lib/spotify/playlistIds";

export function genreFromPatternPosition(
  position: number,
  pattern: GenrePool[]
): GenrePool | null {
  if (pattern.length === 0) return null;
  if (position < 0) return null;
  return pattern[position % pattern.length] ?? null;
}

export function resolveTrackGenre(input: {
  trackId: string;
  playlistIndex: number | null;
  pattern: GenrePool[];
  snapshotByTrackId: Map<string, GenrePool>;
  snapshotByPosition?: Map<number, GenrePool>;
  allowPositionFallback: boolean;
}): GenrePool | null {
  const fromSnapshot = input.snapshotByTrackId.get(input.trackId);
  if (fromSnapshot) return fromSnapshot;

  if (
    input.playlistIndex != null &&
    input.snapshotByPosition?.has(input.playlistIndex)
  ) {
    return input.snapshotByPosition.get(input.playlistIndex) ?? null;
  }

  if (
    input.allowPositionFallback &&
    input.playlistIndex != null &&
    input.pattern.length > 0
  ) {
    return genreFromPatternPosition(input.playlistIndex, input.pattern);
  }

  return null;
}

/** Activation-time genre: master playlist wins, then pattern position. */
export function genreForActivationPosition(
  position: number,
  trackId: string,
  masterGenre: Map<string, GenrePool>,
  pattern: GenrePool[]
): GenrePool {
  const fromMaster = masterGenre.get(trackId);
  if (fromMaster) return fromMaster;
  return genreFromPatternPosition(position, pattern) ?? "cs";
}
