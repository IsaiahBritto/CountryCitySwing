import type { ExternalPlaylistLink } from "@/lib/bioLinks";

/** Master playlist link ids omitted from public /links (internal Spotify use only). */
export const BIO_HIDDEN_PLAYLIST_LINK_IDS = ["waltz-playlist"] as const;

export function filterBioVisiblePlaylistLinks(
  links: ExternalPlaylistLink[]
): ExternalPlaylistLink[] {
  const hidden = new Set<string>(BIO_HIDDEN_PLAYLIST_LINK_IDS);
  return links.filter((l) => !hidden.has(l.id));
}
