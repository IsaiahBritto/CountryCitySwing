export type ActiveCatalogPlaylistStatus = {
  appleMusicPlaylistId: string | null;
  spotifyPlaylistId: string | null;
};

export function activeCatalogPlaylistId(
  status: ActiveCatalogPlaylistStatus
): string | null {
  return status.appleMusicPlaylistId ?? status.spotifyPlaylistId;
}

export function snapshotRowTrackId(row: {
  spotify_track_id: string;
  catalog_track_id?: string | null;
}): string {
  return row.catalog_track_id?.trim() || row.spotify_track_id;
}
