/** Normalize ISRC for cache keys and Musicae requests. */
export function normalizeIsrc(isrc: string | null | undefined): string | null {
  if (typeof isrc !== "string") return null;
  const trimmed = isrc.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

/** Synthetic ISRC PK for Spotify-ID-only cache rows (social snapshot path). */
export function spotifyCacheIsrc(spotifyTrackId: string): string {
  return `SPOTIFY:${spotifyTrackId}`;
}
