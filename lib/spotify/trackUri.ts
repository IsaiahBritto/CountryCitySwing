/** Compare Spotify track URIs, tolerating format differences. */
export function trackUrisMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const idA = extractSpotifyTrackId(a);
  const idB = extractSpotifyTrackId(b);
  return idA != null && idA === idB;
}

export function extractSpotifyTrackId(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("spotify:track:")) {
    return trimmed.slice("spotify:track:".length) || null;
  }
  const openMatch = trimmed.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (openMatch?.[1]) return openMatch[1];
  return trimmed;
}
