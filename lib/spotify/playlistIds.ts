/** Master playlist link ids used by The Social / Spotify generator. */
export const MASTER_PLAYLIST_LINK_IDS = [
  "country-swing-playlist",
  "west-coast-swing-playlist",
  "line-dance-playlist",
] as const;

export type MasterPlaylistLinkId = (typeof MASTER_PLAYLIST_LINK_IDS)[number];

export type GenrePool = "cs" | "wcs" | "ld";

export const LINK_ID_TO_GENRE: Record<MasterPlaylistLinkId, GenrePool> = {
  "country-swing-playlist": "cs",
  "west-coast-swing-playlist": "wcs",
  "line-dance-playlist": "ld",
};

/** Extract a Spotify playlist id from an open.spotify.com URL or raw id. */
export function parseSpotifyPlaylistId(hrefOrId: string): string | null {
  const raw = hrefOrId.trim();
  if (!raw) return null;

  if (/^[a-zA-Z0-9]{22}$/.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/playlist\/([a-zA-Z0-9]+)/);
    if (match?.[1]) return match[1];
  } catch {
    // fall through
  }

  const loose = raw.match(/playlist[/:]([a-zA-Z0-9]{22})/i);
  return loose?.[1] ?? null;
}
