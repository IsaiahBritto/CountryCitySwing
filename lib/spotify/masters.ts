import { getTheSocialPlaylistLinks } from "@/lib/theSocialPlaylistLinks";
import {
  LINK_ID_TO_GENRE,
  MASTER_PLAYLIST_LINK_IDS,
  parseSpotifyPlaylistId,
  type GenrePool,
  type MasterPlaylistLinkId,
} from "@/lib/spotify/playlistIds";

export type MasterPlaylistRef = {
  linkId: MasterPlaylistLinkId;
  label: string;
  spotifyPlaylistId: string;
  genre: GenrePool;
  href: string;
};

export async function getMasterPlaylistRefs(): Promise<MasterPlaylistRef[]> {
  const links = await getTheSocialPlaylistLinks();
  const byId = new Map(links.map((l) => [l.id, l]));
  const refs: MasterPlaylistRef[] = [];

  for (const linkId of MASTER_PLAYLIST_LINK_IDS) {
    const link = byId.get(linkId);
    if (!link) {
      throw new Error(`Missing master playlist link: ${linkId}`);
    }
    const spotifyPlaylistId = parseSpotifyPlaylistId(link.href);
    if (!spotifyPlaylistId) {
      throw new Error(`Could not parse Spotify playlist id from: ${link.href}`);
    }
    refs.push({
      linkId,
      label: link.label,
      spotifyPlaylistId,
      genre: LINK_ID_TO_GENRE[linkId],
      href: link.href,
    });
  }

  return refs;
}
