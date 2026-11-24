/** Stable play URI for deck/session snapshots. */
export function appleMusicSongUri(catalogOrLibraryId: string): string {
  return `appleMusic:songs:${catalogOrLibraryId}`;
}

export function extractAppleMusicSongId(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("appleMusic:songs:")) {
    return trimmed.slice("appleMusic:songs:".length) || null;
  }
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export function extractSpotifyTrackId(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("spotify:track:")) {
    return trimmed.slice("spotify:track:".length) || null;
  }
  const openMatch = trimmed.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (openMatch?.[1]) return openMatch[1];
  return null;
}

export function normalizeTrackIsrc(
  isrc: string | null | undefined
): string | null {
  const trimmed = isrc?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

/** Compare track URIs across Spotify and Apple Music formats. */
export function trackUrisMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const appleA = extractAppleMusicSongId(a);
  const appleB = extractAppleMusicSongId(b);
  if (appleA != null && appleA === appleB) return true;
  const spotifyA = extractSpotifyTrackId(a);
  const spotifyB = extractSpotifyTrackId(b);
  return spotifyA != null && spotifyA === spotifyB;
}

/** URI match, or ISRC match when both sides have ISRC (Apple library vs catalog). */
export function tracksMatchForPlayback(
  deckUri: string | null | undefined,
  sdkUri: string | null | undefined,
  deckIsrc?: string | null,
  sdkIsrc?: string | null
): boolean {
  if (trackUrisMatch(deckUri, sdkUri)) return true;
  const a = normalizeTrackIsrc(deckIsrc);
  const b = normalizeTrackIsrc(sdkIsrc);
  return a != null && a === b;
}
