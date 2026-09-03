import { getTheSocialPlaylistLinks } from "@/lib/theSocialPlaylistLinks";
import {
  LINK_ID_TO_GENRE,
  MASTER_PLAYLIST_LINK_IDS,
  parseSpotifyPlaylistId,
  type GenrePool,
  type MasterPlaylistLinkId,
} from "@/lib/spotify/playlistIds";
import { structureAvailableGenres } from "@/lib/spotify/playlistStructure";
import type { PlaylistStructure } from "@/lib/spotify/playlistStructure";

export type MasterPlaylistRef = {
  linkId: MasterPlaylistLinkId;
  label: string;
  spotifyPlaylistId: string;
  genre: GenrePool;
  href: string;
};

const LINK_ID_BY_GENRE: Record<GenrePool, MasterPlaylistLinkId> = {
  cs: "country-swing-playlist",
  wcs: "west-coast-swing-playlist",
  ld: "line-dance-playlist",
  ts: "two-step-playlist",
};

export async function getMasterPlaylistRefs(): Promise<MasterPlaylistRef[]> {
  return getMasterPlaylistRefsForGenres(["cs", "wcs", "ld"]);
}

export async function getMasterPlaylistRefsForGenres(
  genres: GenrePool[]
): Promise<MasterPlaylistRef[]> {
  const needed = [...new Set(genres)];
  const links = await getTheSocialPlaylistLinks();
  const byId = new Map(links.map((l) => [l.id, l]));
  const refs: MasterPlaylistRef[] = [];

  for (const genre of needed) {
    const linkId = LINK_ID_BY_GENRE[genre];
    const link = byId.get(linkId);
    if (!link) {
      throw new Error(`Missing master playlist link: ${linkId}`);
    }
    const spotifyPlaylistId = parseSpotifyPlaylistId(link.href);
    if (!spotifyPlaylistId) {
      throw new Error(
        `Could not parse Spotify playlist id for ${link.label}. Add a valid URL in The Social playlist links.`
      );
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

export async function getMasterPlaylistRefsForStructure(
  structure: PlaylistStructure
): Promise<MasterPlaylistRef[]> {
  return getMasterPlaylistRefsForGenres(structureAvailableGenres(structure));
}

/** @deprecated use LINK_ID_BY_GENRE */
export { MASTER_PLAYLIST_LINK_IDS, LINK_ID_TO_GENRE };
