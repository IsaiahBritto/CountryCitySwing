import { buildEndOfSessionPlaylistOrder } from "@/lib/appleMusic/buildEndOfSessionPlaylistOrder";
import { syncLibraryPlaylistFromSnapshot } from "@/lib/appleMusic/syncLibraryPlaylistFromSnapshot";
import { activeCatalogPlaylistId } from "@/lib/spotify/activeCatalogPlaylist";
import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";
import { sessionDeckState, type DjSessionRow } from "@/lib/spotify/djSession";
import { getMusicServiceAccess } from "@/lib/music/serviceAccess";

/**
 * Rebuild the active Apple Music library playlist to played-only order from ended session deck state.
 * Best-effort: logs and returns without throwing on Apple errors.
 */
export async function mirrorApplePlaylistAtSessionEnd(
  session: DjSessionRow
): Promise<void> {
  let serviceAccess;
  try {
    serviceAccess = await getMusicServiceAccess();
  } catch (err) {
    console.warn("Apple Music session-end mirror skipped (service access):", err);
    return;
  }
  if (serviceAccess.provider !== "apple_music") return;

  const status = await getActivePlaylistStatus();
  const playlistId = status.appleMusicPlaylistId;
  if (!playlistId) return;

  const catalogId = activeCatalogPlaylistId(status);
  if (!catalogId) return;

  const deckState = sessionDeckState(session.deck_state);
  const orderedCatalogSongIds = buildEndOfSessionPlaylistOrder(
    deckState,
    catalogId
  );

  try {
    await syncLibraryPlaylistFromSnapshot({
      developerToken: serviceAccess.developerToken,
      musicUserToken: serviceAccess.musicUserToken,
      playlistId,
      orderedCatalogSongIds,
    });
  } catch (err) {
    console.warn("Apple Music library playlist mirror at session end failed:", err);
  }
}
