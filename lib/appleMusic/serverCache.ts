import type { OwnedPlaylistSummary, AppleMusicTrack } from "@/lib/appleMusic/client";
import { supabaseServer } from "@/lib/supabaseServer";

const OWNED_CACHE_ID = "default";

export async function readAppleOwnedPlaylistsCache(
  appleUserHash: string
): Promise<{ playlists: OwnedPlaylistSummary[]; fetchedAt: string } | null> {
  const { data, error } = await supabaseServer
    .from("apple_music_owned_playlists_cache")
    .select("apple_user_hash, playlists, fetched_at")
    .eq("id", OWNED_CACHE_ID)
    .maybeSingle();

  if (error || !data) return null;
  if (data.apple_user_hash !== appleUserHash) return null;
  return {
    playlists: (data.playlists ?? []) as OwnedPlaylistSummary[],
    fetchedAt: data.fetched_at,
  };
}

export async function clearAppleOwnedPlaylistsCache(): Promise<void> {
  await supabaseServer
    .from("apple_music_owned_playlists_cache")
    .delete()
    .eq("id", OWNED_CACHE_ID);
}

export async function writeAppleOwnedPlaylistsCache(input: {
  appleUserHash: string;
  playlists: OwnedPlaylistSummary[];
}): Promise<void> {
  const now = new Date().toISOString();
  await supabaseServer.from("apple_music_owned_playlists_cache").upsert(
    {
      id: OWNED_CACHE_ID,
      apple_user_hash: input.appleUserHash,
      playlists: input.playlists,
      fetched_at: now,
    },
    { onConflict: "id" }
  );
}

export async function readApplePlaylistTracksCache(
  playlistId: string
): Promise<{
  tracks: AppleMusicTrack[];
  totalDurationMs: number;
  fetchedAt: string;
} | null> {
  const { data, error } = await supabaseServer
    .from("apple_music_playlist_tracks_cache")
    .select("playlist_id, tracks, total_duration_ms, fetched_at")
    .eq("playlist_id", playlistId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    tracks: (data.tracks ?? []) as AppleMusicTrack[],
    totalDurationMs: Number(data.total_duration_ms ?? 0),
    fetchedAt: data.fetched_at,
  };
}

export async function writeApplePlaylistTracksCache(input: {
  playlistId: string;
  tracks: AppleMusicTrack[];
  totalDurationMs: number;
}): Promise<void> {
  const now = new Date().toISOString();
  await supabaseServer.from("apple_music_playlist_tracks_cache").upsert(
    {
      playlist_id: input.playlistId,
      tracks: input.tracks,
      total_duration_ms: input.totalDurationMs,
      fetched_at: now,
    },
    { onConflict: "playlist_id" }
  );
}
