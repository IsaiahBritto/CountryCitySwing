import type { OwnedPlaylistSummary, SpotifyTrack } from "@/lib/spotify/client";
import { supabaseServer } from "@/lib/supabaseServer";
import { incrementUsageRollup } from "@/lib/spotify/spotifyUsageMetrics";

const OWNED_CACHE_ID = "default";

export type CachedOwnedPlaylists = {
  spotifyUserId: string;
  playlists: OwnedPlaylistSummary[];
  fetchedAt: string;
};

export async function readOwnedPlaylistsCache(
  spotifyUserId: string
): Promise<CachedOwnedPlaylists | null> {
  const { data, error } = await supabaseServer
    .from("spotify_owned_playlists_cache")
    .select("spotify_user_id, playlists, fetched_at")
    .eq("id", OWNED_CACHE_ID)
    .maybeSingle();

  if (error || !data) return null;
  if (data.spotify_user_id !== spotifyUserId) return null;

  return {
    spotifyUserId: data.spotify_user_id,
    playlists: (data.playlists ?? []) as OwnedPlaylistSummary[],
    fetchedAt: data.fetched_at,
  };
}

export async function writeOwnedPlaylistsCache(input: {
  spotifyUserId: string;
  playlists: OwnedPlaylistSummary[];
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseServer.from("spotify_owned_playlists_cache").upsert(
    {
      id: OWNED_CACHE_ID,
      spotify_user_id: input.spotifyUserId,
      playlists: input.playlists,
      fetched_at: now,
    },
    { onConflict: "id" }
  );
  if (error) {
    console.warn("writeOwnedPlaylistsCache failed:", error.message);
  }
}

export type CachedPlaylistTracks = {
  playlistId: string;
  snapshotId: string | null;
  tracks: SpotifyTrack[];
  totalDurationMs: number;
  fetchedAt: string;
};

export async function readPlaylistTracksCache(
  playlistId: string
): Promise<CachedPlaylistTracks | null> {
  const { data, error } = await supabaseServer
    .from("spotify_playlist_tracks_cache")
    .select("playlist_id, snapshot_id, tracks, total_duration_ms, fetched_at")
    .eq("playlist_id", playlistId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    playlistId: data.playlist_id,
    snapshotId: data.snapshot_id ?? null,
    tracks: (data.tracks ?? []) as SpotifyTrack[],
    totalDurationMs: Number(data.total_duration_ms ?? 0),
    fetchedAt: data.fetched_at,
  };
}

export async function writePlaylistTracksCache(input: {
  playlistId: string;
  snapshotId?: string | null;
  tracks: SpotifyTrack[];
  totalDurationMs: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseServer.from("spotify_playlist_tracks_cache").upsert(
    {
      playlist_id: input.playlistId,
      snapshot_id: input.snapshotId ?? null,
      tracks: input.tracks,
      total_duration_ms: input.totalDurationMs,
      fetched_at: now,
    },
    { onConflict: "playlist_id" }
  );
  if (error) {
    console.warn("writePlaylistTracksCache failed:", error.message);
  }
}

export async function recordCacheHit(group: string): Promise<void> {
  await incrementUsageRollup(group, "cache_hit");
}

const ACTIVE_ID = "default";

export async function readActivePlaylistSnapshotId(): Promise<string | null> {
  const { data } = await supabaseServer
    .from("social_active_playlist")
    .select("spotify_snapshot_id")
    .eq("id", ACTIVE_ID)
    .maybeSingle();
  return typeof data?.spotify_snapshot_id === "string"
    ? data.spotify_snapshot_id
    : null;
}

export async function writeActivePlaylistSnapshotId(
  snapshotId: string | null
): Promise<void> {
  const now = new Date().toISOString();
  await supabaseServer
    .from("social_active_playlist")
    .update({ spotify_snapshot_id: snapshotId, updated_at: now })
    .eq("id", ACTIVE_ID);
}
