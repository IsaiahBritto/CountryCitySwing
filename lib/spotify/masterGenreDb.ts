import type { GenrePool } from "@/lib/spotify/playlistIds";
import { supabaseServer } from "@/lib/supabaseServer";
import { getMasterPlaylistRefs } from "@/lib/spotify/masters";
import {
  fetchPlaylistTracks,
  type SpotifyTrack,
} from "@/lib/spotify/client";
import { getValidAccessToken } from "@/lib/spotify/auth";

export async function lookupMasterGenreFromDb(
  trackId: string
): Promise<GenrePool | null> {
  const { data, error } = await supabaseServer
    .from("spotify_master_track_genre")
    .select("genre")
    .eq("spotify_track_id", trackId)
    .maybeSingle();

  if (error || !data?.genre) return null;
  const genre = data.genre;
  if (genre === "cs" || genre === "wcs" || genre === "ld" || genre === "ts") {
    return genre;
  }
  return null;
}

export async function upsertMasterGenreRow(
  trackId: string,
  genre: GenrePool
): Promise<void> {
  const now = new Date().toISOString();
  await supabaseServer.from("spotify_master_track_genre").upsert(
    {
      spotify_track_id: trackId,
      genre,
      updated_at: now,
    },
    { onConflict: "spotify_track_id" }
  );
}

export async function rebuildMasterGenreIndexFromSpotify(): Promise<{
  trackCount: number;
}> {
  const { accessToken } = await getValidAccessToken();
  const masters = await getMasterPlaylistRefs();
  const now = new Date().toISOString();
  let trackCount = 0;

  for (const master of masters) {
    const tracks = await fetchPlaylistTracks(
      accessToken,
      master.spotifyPlaylistId
    );
    for (const t of tracks) {
      await supabaseServer.from("spotify_master_track_genre").upsert(
        {
          spotify_track_id: t.id,
          genre: master.genre,
          updated_at: now,
        },
        { onConflict: "spotify_track_id" }
      );
      trackCount += 1;
    }
  }

  return { trackCount };
}

export async function buildMasterGenreMapFromDb(): Promise<Map<string, GenrePool>> {
  const { data, error } = await supabaseServer
    .from("spotify_master_track_genre")
    .select("spotify_track_id, genre");

  const map = new Map<string, GenrePool>();
  if (error || !data) return map;

  for (const row of data) {
    const id = row.spotify_track_id;
    const genre = row.genre;
    if (
      typeof id === "string" &&
      (genre === "cs" || genre === "wcs" || genre === "ld" || genre === "ts") &&
      !map.has(id)
    ) {
      map.set(id, genre);
    }
  }
  return map;
}

export async function ensureMasterGenreMap(
  accessToken: string,
  options?: { bypassCache?: boolean }
): Promise<Map<string, GenrePool>> {
  const dbMap = await buildMasterGenreMapFromDb();
  if (!options?.bypassCache && dbMap.size > 0) {
    return dbMap;
  }
  await rebuildMasterGenreIndexFromSpotify();
  return buildMasterGenreMapFromDb();
}

export type { SpotifyTrack };
