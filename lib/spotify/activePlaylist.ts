import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  fetchPlaylistMeta,
  fetchPlaylistTracks,
  type SpotifyTrack,
} from "@/lib/spotify/client";
import { SET_PATTERN } from "@/lib/spotify/curate";
import { getMasterPlaylistRefs } from "@/lib/spotify/masters";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { parseSpotifyPlaylistId } from "@/lib/spotify/playlistIds";
import { supabaseServer } from "@/lib/supabaseServer";

export type ActivePlaylistStatus = {
  isActive: boolean;
  spotifyPlaylistId: string | null;
  playlistUrl: string | null;
  name: string | null;
  activatedAt: string | null;
  trackCount: number;
};

export type SocialPlaylistTrackRow = {
  position: number;
  spotify_track_id: string;
  uri: string;
  name: string;
  primary_artist: string;
  genre: GenrePool;
  source: "generated" | "request";
};

const ACTIVE_ID = "default";

export async function getActivePlaylistStatus(): Promise<ActivePlaylistStatus> {
  const { data, error } = await supabaseServer
    .from("social_active_playlist")
    .select(
      "is_active, spotify_playlist_id, playlist_url, name, activated_at"
    )
    .eq("id", ACTIVE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active playlist: ${error.message}`);
  }

  if (!data || !data.is_active || !data.spotify_playlist_id) {
    return {
      isActive: false,
      spotifyPlaylistId: null,
      playlistUrl: null,
      name: null,
      activatedAt: null,
      trackCount: 0,
    };
  }

  const { count } = await supabaseServer
    .from("social_playlist_tracks")
    .select("id", { count: "exact", head: true })
    .eq("active_playlist_id", ACTIVE_ID);

  return {
    isActive: true,
    spotifyPlaylistId: data.spotify_playlist_id,
    playlistUrl: data.playlist_url,
    name: data.name || null,
    activatedAt: data.activated_at,
    trackCount: count ?? 0,
  };
}

export async function loadSnapshotTracks(): Promise<SocialPlaylistTrackRow[]> {
  const { data, error } = await supabaseServer
    .from("social_playlist_tracks")
    .select(
      "position, spotify_track_id, uri, name, primary_artist, genre, source"
    )
    .eq("active_playlist_id", ACTIVE_ID)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed to load playlist snapshot: ${error.message}`);
  }

  return (data ?? []) as SocialPlaylistTrackRow[];
}

type MasterGenreCache = {
  map: Map<string, GenrePool>;
  expiresAt: number;
};

let masterGenreCache: MasterGenreCache | null = null;
const MASTER_GENRE_TTL_MS = 5 * 60 * 1000;

/** Build genre map for track ids across the three masters (first match wins). */
export async function buildMasterGenreMap(
  accessToken: string,
  options?: { bypassCache?: boolean }
): Promise<Map<string, GenrePool>> {
  const now = Date.now();
  if (
    !options?.bypassCache &&
    masterGenreCache &&
    masterGenreCache.expiresAt > now
  ) {
    return masterGenreCache.map;
  }

  const masters = await getMasterPlaylistRefs();
  const map = new Map<string, GenrePool>();
  for (const master of masters) {
    const tracks = await fetchPlaylistTracks(
      accessToken,
      master.spotifyPlaylistId
    );
    for (const t of tracks) {
      if (!map.has(t.id)) map.set(t.id, master.genre);
    }
  }
  masterGenreCache = { map, expiresAt: now + MASTER_GENRE_TTL_MS };
  return map;
}

export function invalidateMasterGenreCache(): void {
  masterGenreCache = null;
}

export async function lookupTrackGenreInMasters(
  trackId: string
): Promise<GenrePool | null> {
  const { accessToken } = await getValidAccessToken();
  const map = await buildMasterGenreMap(accessToken);
  return map.get(trackId) ?? null;
}

function genreForPosition(
  position: number,
  trackId: string,
  masterGenre: Map<string, GenrePool>
): GenrePool {
  const fromMaster = masterGenre.get(trackId);
  if (fromMaster) return fromMaster;
  return SET_PATTERN[position % SET_PATTERN.length];
}

export async function activateSocialPlaylist(input: {
  playlistIdOrUrl: string;
  activatedBy: string | null;
}): Promise<ActivePlaylistStatus> {
  const playlistId = parseSpotifyPlaylistId(input.playlistIdOrUrl);
  if (!playlistId) {
    throw new Error("Could not parse Spotify playlist id");
  }

  const { accessToken } = await getValidAccessToken();
  const meta = await fetchPlaylistMeta(accessToken, playlistId);
  const tracks = await fetchPlaylistTracks(accessToken, playlistId, {
    dedupe: false,
  });
  if (tracks.length === 0) {
    throw new Error("Playlist has no playable tracks");
  }

  const masterGenre = await buildMasterGenreMap(accessToken);
  const now = new Date().toISOString();

  const { error: upsertError } = await supabaseServer
    .from("social_active_playlist")
    .upsert(
      {
        id: ACTIVE_ID,
        spotify_playlist_id: meta.id,
        playlist_url: meta.url,
        name: meta.name,
        activated_at: now,
        activated_by: input.activatedBy,
        is_active: true,
        updated_at: now,
      },
      { onConflict: "id" }
    );

  if (upsertError) {
    throw new Error(`Failed to activate playlist: ${upsertError.message}`);
  }

  const { error: deleteError } = await supabaseServer
    .from("social_playlist_tracks")
    .delete()
    .eq("active_playlist_id", ACTIVE_ID);

  if (deleteError) {
    throw new Error(`Failed to clear snapshot: ${deleteError.message}`);
  }

  const rows = tracks.map((t, position) => ({
    active_playlist_id: ACTIVE_ID,
    position,
    spotify_track_id: t.id,
    uri: t.uri,
    name: t.name,
    primary_artist: t.primaryArtist,
    genre: genreForPosition(position, t.id, masterGenre),
    source: "generated" as const,
    updated_at: now,
  }));

  // Insert in chunks
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabaseServer
      .from("social_playlist_tracks")
      .insert(chunk);
    if (error) {
      throw new Error(`Failed to save snapshot: ${error.message}`);
    }
  }

  return getActivePlaylistStatus();
}

export async function deactivateSocialPlaylist(): Promise<ActivePlaylistStatus> {
  const now = new Date().toISOString();
  const { error } = await supabaseServer
    .from("social_active_playlist")
    .update({
      is_active: false,
      updated_at: now,
    })
    .eq("id", ACTIVE_ID);

  if (error) {
    throw new Error(`Failed to deactivate playlist: ${error.message}`);
  }

  return getActivePlaylistStatus();
}

export async function ensureTrackOnMaster(input: {
  accessToken: string;
  track: SpotifyTrack | { id: string; uri: string };
  genre: GenrePool;
  masterGenreMap?: Map<string, GenrePool>;
}): Promise<{ addedToMaster: boolean }> {
  const map =
    input.masterGenreMap ?? (await buildMasterGenreMap(input.accessToken));
  if (map.has(input.track.id)) {
    return { addedToMaster: false };
  }

  const masters = await getMasterPlaylistRefs();
  const master = masters.find((m) => m.genre === input.genre);
  if (!master) {
    throw new Error(`No master playlist for genre ${input.genre}`);
  }

  await addTracksToPlaylist(input.accessToken, master.spotifyPlaylistId, [
    input.track.uri,
  ]);
  invalidateMasterGenreCache();
  return { addedToMaster: true };
}
