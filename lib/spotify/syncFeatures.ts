import { getValidAccessToken } from "@/lib/spotify/auth";
import { fetchPlaylistTracks } from "@/lib/spotify/client";
import { resolveTrackFeatures } from "@/lib/spotify/features";
import { getMasterPlaylistRefs } from "@/lib/spotify/masters";
import { parseSpotifyPlaylistId } from "@/lib/spotify/playlistIds";

export type SyncPlaylistResult = {
  playlistId: string;
  label: string | null;
  scanned: number;
  lookedUp: number;
  stillUnknown: number;
};

export type SyncFeaturesResult = {
  scanned: number;
  lookedUp: number;
  stillUnknown: number;
  playlists: SyncPlaylistResult[];
};

async function syncOnePlaylist(
  accessToken: string,
  playlistId: string,
  label: string | null
): Promise<SyncPlaylistResult> {
  const tracks = await fetchPlaylistTracks(accessToken, playlistId);
  const resolved = await resolveTrackFeatures(tracks);
  return {
    playlistId,
    label,
    scanned: resolved.scanned,
    lookedUp: resolved.lookedUp,
    stillUnknown: resolved.stillUnknown,
  };
}

/**
 * Sync FreqBlog features for one or more Spotify playlists.
 * When playlistIds is empty/omitted, syncs all three master playlists.
 */
export async function syncPlaylistFeatures(input?: {
  playlistId?: string;
  playlistIds?: string[];
}): Promise<SyncFeaturesResult> {
  const { accessToken } = await getValidAccessToken();
  const masters = await getMasterPlaylistRefs();
  const masterBySpotifyId = new Map(
    masters.map((m) => [m.spotifyPlaylistId, m])
  );

  let ids: string[] = [];
  if (input?.playlistId) {
    const parsed = parseSpotifyPlaylistId(input.playlistId) ?? input.playlistId;
    ids = [parsed];
  } else if (input?.playlistIds?.length) {
    ids = input.playlistIds.map(
      (id) => parseSpotifyPlaylistId(id) ?? id
    );
  } else {
    ids = masters.map((m) => m.spotifyPlaylistId);
  }

  const playlists: SyncPlaylistResult[] = [];
  for (const id of ids) {
    const master = masterBySpotifyId.get(id);
    playlists.push(
      await syncOnePlaylist(accessToken, id, master?.label ?? null)
    );
  }

  return {
    scanned: playlists.reduce((s, p) => s + p.scanned, 0),
    lookedUp: playlists.reduce((s, p) => s + p.lookedUp, 0),
    stillUnknown: playlists.reduce((s, p) => s + p.stillUnknown, 0),
    playlists,
  };
}
