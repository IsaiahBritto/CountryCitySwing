import {
  addTracksToLibraryPlaylist,
  listLibraryPlaylistTrackRelationshipIds,
  removeTracksFromLibraryPlaylist,
} from "@/lib/appleMusic/client";

/**
 * Rebuild the Apple Music library playlist to match the Supabase snapshot order.
 * Supabase remains authoritative; mirror failures are logged by callers.
 */
export async function syncLibraryPlaylistFromSnapshot(input: {
  developerToken: string;
  musicUserToken: string;
  playlistId: string;
  /** Catalog song ids in playlist order. */
  orderedCatalogSongIds: string[];
}): Promise<void> {
  const desired = input.orderedCatalogSongIds.filter(Boolean);
  const existing = await listLibraryPlaylistTrackRelationshipIds({
    developerToken: input.developerToken,
    musicUserToken: input.musicUserToken,
    playlistId: input.playlistId,
  });

  if (existing.length > 0) {
    await removeTracksFromLibraryPlaylist({
      developerToken: input.developerToken,
      musicUserToken: input.musicUserToken,
      playlistId: input.playlistId,
      libraryTrackIds: existing,
    });
  }

  if (desired.length === 0) return;

  await addTracksToLibraryPlaylist({
    developerToken: input.developerToken,
    musicUserToken: input.musicUserToken,
    playlistId: input.playlistId,
    songIds: desired,
  });
}
