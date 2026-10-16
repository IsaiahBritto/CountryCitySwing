import {
  addTracksToLibraryPlaylist,
} from "@/lib/appleMusic/client";
import { isServerAppleMusic } from "@/lib/music/serverProvider";
import type { MusicServiceAccess } from "@/lib/music/serviceAccess";
import {
  addTracksToPlaylist as spotifyAddTracks,
  fetchPlaylistSnapshotIdOnly as spotifyFetchSnapshot,
  getCurrentlyPlaying as spotifyGetCurrentlyPlaying,
  removePlaylistItemAtPosition as spotifyRemoveAt,
  replacePlaylistItemAtPosition as spotifyReplaceAt,
  swapPlaylistItemsAtPositions as spotifySwap,
  searchTracks as spotifySearch,
  type SpotifySearchTrack,
} from "@/lib/spotify/client";
import { searchCatalogSongs } from "@/lib/appleMusic/client";

/** Supabase is authoritative for Apple Music social playlists; skip remote reorder APIs. */
const APPLE_REMOTE_MUTATIONS = false;

export type SearchTrackResult = SpotifySearchTrack;

export async function searchCatalogTracks(
  access: MusicServiceAccess,
  query: string
): Promise<SearchTrackResult[]> {
  if (access.provider === "apple_music") {
    const tracks = await searchCatalogSongs({
      developerToken: access.developerToken,
      musicUserToken: access.musicUserToken,
      storefront: access.storefrontId,
      term: query,
    });
    return tracks.map((t) => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      primaryArtist: t.primaryArtist,
      albumName: null,
      imageUrl: null,
      durationMs: t.durationMs,
      isrc: t.isrc,
    }));
  }
  return spotifySearch(access.accessToken, query);
}

export async function getCurrentlyPlaying(access: MusicServiceAccess) {
  if (access.provider === "apple_music") return null;
  return spotifyGetCurrentlyPlaying(access.accessToken);
}

export async function replacePlaylistItemAtPosition(
  access: MusicServiceAccess,
  playlistId: string,
  position: number,
  existingUri: string,
  newUri: string,
  opts?: { useActivePlaylistCache?: boolean; cachedSnapshotId?: string | null }
): Promise<void> {
  if (access.provider === "apple_music") {
    if (!APPLE_REMOTE_MUTATIONS) return;
  } else {
    await spotifyReplaceAt(
      access.accessToken,
      playlistId,
      position,
      existingUri,
      newUri,
      opts
    );
  }
}

export async function swapPlaylistItemsAtPositions(
  access: MusicServiceAccess,
  playlistId: string,
  from: number,
  fromUri: string,
  to: number,
  toUri: string,
  opts?: { useActivePlaylistCache?: boolean; cachedSnapshotId?: string | null }
): Promise<void> {
  if (access.provider === "apple_music") {
    if (!APPLE_REMOTE_MUTATIONS) return;
  } else {
    await spotifySwap(
      access.accessToken,
      playlistId,
      from,
      fromUri,
      to,
      toUri,
      opts
    );
  }
}

export async function removePlaylistItemAtPosition(
  access: MusicServiceAccess,
  playlistId: string,
  trackUri: string,
  position: number,
  opts?: { useActivePlaylistCache?: boolean; cachedSnapshotId?: string | null }
): Promise<void> {
  if (access.provider === "apple_music") {
    if (!APPLE_REMOTE_MUTATIONS) return;
  } else {
    await spotifyRemoveAt(
      access.accessToken,
      playlistId,
      trackUri,
      position,
      opts
    );
  }
}

export async function addTracksToPlaylist(
  access: MusicServiceAccess,
  playlistId: string,
  uris: string[]
): Promise<void> {
  if (access.provider === "apple_music") {
    if (!APPLE_REMOTE_MUTATIONS) return;
    const songIds = uris.map((u) =>
      u.startsWith("appleMusic:songs:") ? u.slice("appleMusic:songs:".length) : u
    );
    await addTracksToLibraryPlaylist({
      developerToken: access.developerToken,
      musicUserToken: access.musicUserToken,
      playlistId,
      songIds,
    });
    return;
  }
  await spotifyAddTracks(access.accessToken, playlistId, uris);
}

export async function fetchPlaylistSnapshotIdOnly(
  access: MusicServiceAccess,
  playlistId: string
): Promise<string | null> {
  if (access.provider === "apple_music") return null;
  return spotifyFetchSnapshot(access.accessToken, playlistId);
}

export async function usesAppleMusicPlaylistAuthority(): Promise<boolean> {
  return isServerAppleMusic();
}
