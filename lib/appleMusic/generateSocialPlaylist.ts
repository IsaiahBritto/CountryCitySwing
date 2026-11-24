import {
  addTracksToLibraryPlaylist,
  createLibraryPlaylist,
  fetchCatalogSongDurationsMs,
} from "@/lib/appleMusic/client";
import { mapCuratedTracksToApple } from "@/lib/appleMusic/mapCuratedTracksToApple";
import { clearAppleOwnedPlaylistsCache } from "@/lib/appleMusic/serverCache";
import { curateSocialFromMasters } from "@/lib/music/curateSocialFromMasters";
import { getMusicServiceAccess } from "@/lib/music/serviceAccess";
import { getSpotifyAccessTokenForMasters } from "@/lib/spotify/masterServiceAccess";
import {
  DEFAULT_DURATION_MINUTES,
  DEFAULT_SOCIAL_STRUCTURE,
  structureDescription,
  validateDurationMinutes,
  validatePlaylistStructure,
  type PlaylistStructure,
} from "@/lib/spotify/playlistStructure";

export type GenerateAppleSocialPlaylistOptions = {
  lookupFeatures?: boolean;
  durationMinutes?: number;
  structure?: PlaylistStructure;
};

export type GenerateAppleSocialPlaylistResult = {
  id: string;
  name: string;
  trackCount: number;
  durationMs: number;
  lookedUp: number;
  stillUnknown: number;
  replacedForApple: number;
  durationMinutes: number;
  structure: PlaylistStructure;
};

export async function generateAppleSocialPlaylist(
  name: string,
  options?: GenerateAppleSocialPlaylistOptions
): Promise<GenerateAppleSocialPlaylistResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Playlist name is required");
  }
  if (trimmed.length > 100) {
    throw new Error("Playlist name must be 100 characters or fewer");
  }

  const lookupFeatures = options?.lookupFeatures === true;
  const durationMinutes = validateDurationMinutes(
    options?.durationMinutes ?? DEFAULT_DURATION_MINUTES
  );
  const structure = validatePlaylistStructure(
    options?.structure ?? DEFAULT_SOCIAL_STRUCTURE
  );

  const spotifyAccessToken = await getSpotifyAccessTokenForMasters();
  const serviceAccess = await getMusicServiceAccess();
  if (serviceAccess.provider !== "apple_music") {
    throw new Error("Apple Music is not the active music provider");
  }

  const { curated, pools, lookedUp, stillUnknown } =
    await curateSocialFromMasters({
      lookupFeatures,
      durationMinutes,
      structure,
      spotifyAccessToken,
    });

  const { appleCatalogSongIds, replacedForApple } =
    await mapCuratedTracksToApple({
      curatedTracks: curated.tracks,
      pools,
      developerToken: serviceAccess.developerToken,
      storefront: serviceAccess.storefrontId,
    });

  const description = `Country City Swing — ${structureDescription(structure)} / ${durationMinutes} min`;

  const created = await createLibraryPlaylist({
    developerToken: serviceAccess.developerToken,
    musicUserToken: serviceAccess.musicUserToken,
    name: trimmed,
    description,
  });

  await addTracksToLibraryPlaylist({
    developerToken: serviceAccess.developerToken,
    musicUserToken: serviceAccess.musicUserToken,
    playlistId: created.id,
    songIds: appleCatalogSongIds,
  });

  const durations = await fetchCatalogSongDurationsMs({
    developerToken: serviceAccess.developerToken,
    storefront: serviceAccess.storefrontId,
    songIds: appleCatalogSongIds,
  });
  let durationMs = 0;
  for (const id of appleCatalogSongIds) {
    durationMs += durations.get(id) ?? 0;
  }
  if (durationMs <= 0) {
    durationMs = curated.durationMs;
  }

  await clearAppleOwnedPlaylistsCache();

  return {
    id: created.id,
    name: created.name,
    trackCount: appleCatalogSongIds.length,
    durationMs,
    lookedUp,
    stillUnknown,
    replacedForApple,
    durationMinutes,
    structure,
  };
}
