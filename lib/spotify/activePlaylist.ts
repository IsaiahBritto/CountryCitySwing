import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  fetchPlaylistMeta,
  fetchPlaylistTracks,
  type SpotifyTrack,
} from "@/lib/spotify/client";
import {
  DEFAULT_SOCIAL_STRUCTURE,
  expandStructure,
  getDefaultPattern,
  parsePlaylistStructure,
  structureAvailableGenres,
  validatePlaylistStructure,
  type PlaylistStructure,
} from "@/lib/spotify/playlistStructure";
import {
  defaultRequestLimits,
  parseRequestLimits,
  validateRequestLimits,
  type RequestLimits,
} from "@/lib/spotify/requestLimits";
import {
  DEFAULT_REQUEST_REFRESH_MINUTES,
  parseRequestRefreshMinutes,
  validateRequestRefreshMinutes,
  type RequestRefreshMinutes,
} from "@/lib/spotify/requestRefresh";
import {
  ensureMasterGenreMap,
  lookupMasterGenreFromDb,
  rebuildMasterGenreIndexFromSpotify,
  upsertMasterGenreRow,
} from "@/lib/spotify/masterGenreDb";
import { getMasterPlaylistRefsForGenres } from "@/lib/spotify/masters";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { parseSpotifyPlaylistId } from "@/lib/spotify/playlistIds";
import { genreForActivationPosition } from "@/lib/spotify/trackGenre";
import { writeActivePlaylistSnapshotId } from "@/lib/spotify/spotifyServerCache";
import { supabaseServer } from "@/lib/supabaseServer";

export type ActivePlaylistStatus = {
  isActive: boolean;
  spotifyPlaylistId: string | null;
  playlistUrl: string | null;
  name: string | null;
  activatedAt: string | null;
  activationId: string | null;
  requestRefreshMinutes: RequestRefreshMinutes;
  trackCount: number;
  requestLimits: RequestLimits | null;
  availableGenres: GenrePool[];
  structure: PlaylistStructure | null;
  pattern: GenrePool[];
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

function resolveStructure(raw: unknown): PlaylistStructure {
  return parsePlaylistStructure(raw) ?? DEFAULT_SOCIAL_STRUCTURE;
}

function statusFromRow(data: {
  is_active: boolean;
  spotify_playlist_id: string | null;
  playlist_url: string | null;
  name: string | null;
  activated_at: string | null;
  activation_id: string | null;
  request_refresh_minutes: number | null;
  request_limits: unknown;
  playlist_structure: unknown;
}, trackCount: number): ActivePlaylistStatus {
  const structure = data.playlist_structure
    ? resolveStructure(data.playlist_structure)
    : null;
  const pattern = structure
    ? expandStructure(structure)
    : getDefaultPattern();
  const availableGenres = structure
    ? structureAvailableGenres(structure)
    : structureAvailableGenres(DEFAULT_SOCIAL_STRUCTURE);

  return {
    isActive: true,
    spotifyPlaylistId: data.spotify_playlist_id,
    playlistUrl: data.playlist_url,
    name: data.name || null,
    activatedAt: data.activated_at,
    activationId: data.activation_id,
    requestRefreshMinutes:
      parseRequestRefreshMinutes(data.request_refresh_minutes) ??
      DEFAULT_REQUEST_REFRESH_MINUTES,
    trackCount,
    requestLimits: parseRequestLimits(data.request_limits),
    availableGenres,
    structure,
    pattern,
  };
}

export async function getActivePlaylistStatus(): Promise<ActivePlaylistStatus> {
  const { data, error } = await supabaseServer
    .from("social_active_playlist")
    .select(
      "is_active, spotify_playlist_id, playlist_url, name, activated_at, activation_id, request_refresh_minutes, request_limits, playlist_structure"
    )
    .eq("id", ACTIVE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active playlist: ${error.message}`);
  }

  const inactiveAvailable = structureAvailableGenres(DEFAULT_SOCIAL_STRUCTURE);

  if (!data || !data.is_active || !data.spotify_playlist_id) {
    return {
      isActive: false,
      spotifyPlaylistId: null,
      playlistUrl: null,
      name: null,
      activatedAt: null,
      activationId: null,
      requestRefreshMinutes: DEFAULT_REQUEST_REFRESH_MINUTES,
      trackCount: 0,
      requestLimits: null,
      availableGenres: inactiveAvailable,
      structure: null,
      pattern: getDefaultPattern(),
    };
  }

  const { count } = await supabaseServer
    .from("social_playlist_tracks")
    .select("id", { count: "exact", head: true })
    .eq("active_playlist_id", ACTIVE_ID);

  return statusFromRow(data, count ?? 0);
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

  const dbMap = await ensureMasterGenreMap(accessToken, options);
  if (dbMap.size > 0) {
    masterGenreCache = { map: dbMap, expiresAt: now + MASTER_GENRE_TTL_MS };
    return dbMap;
  }

  await rebuildMasterGenreIndexFromSpotify();
  const refreshed = await ensureMasterGenreMap(accessToken, {
    bypassCache: true,
  });
  masterGenreCache = { map: refreshed, expiresAt: now + MASTER_GENRE_TTL_MS };
  return refreshed;
}

export function invalidateMasterGenreCache(): void {
  masterGenreCache = null;
}

export async function lookupTrackGenreInMasters(
  trackId: string
): Promise<GenrePool | null> {
  const fromDb = await lookupMasterGenreFromDb(trackId);
  if (fromDb) return fromDb;
  const { accessToken } = await getValidAccessToken();
  const map = await buildMasterGenreMap(accessToken);
  return map.get(trackId) ?? null;
}

export async function activateSocialPlaylist(input: {
  playlistIdOrUrl: string;
  activatedBy: string | null;
  requestLimits?: RequestLimits | null;
  requestRefreshMinutes?: RequestRefreshMinutes;
  structure: PlaylistStructure;
}): Promise<ActivePlaylistStatus> {
  const playlistId = parseSpotifyPlaylistId(input.playlistIdOrUrl);
  if (!playlistId) {
    throw new Error("Could not parse Spotify playlist id");
  }

  const { accessToken, spotifyUserId } = await getValidAccessToken();
  const meta = await fetchPlaylistMeta(accessToken, playlistId);
  if (meta.snapshotId) {
    await writeActivePlaylistSnapshotId(meta.snapshotId);
  }
  if (meta.ownerId && meta.ownerId !== spotifyUserId) {
    throw new Error(
      "That playlist is not owned by the connected Spotify account, so song requests cannot edit it. Pick one from your owned playlists list."
    );
  }
  const tracks = await fetchPlaylistTracks(accessToken, playlistId, {
    dedupe: false,
  });
  if (tracks.length === 0) {
    throw new Error("Playlist has no playable tracks");
  }

  const masterGenre = await buildMasterGenreMap(accessToken);
  const now = new Date().toISOString();
  const structure = validatePlaylistStructure(input.structure);
  const pattern = expandStructure(structure);
  const availableGenres = structureAvailableGenres(structure);
  const requestLimits =
    input.requestLimits != null
      ? validateRequestLimits(input.requestLimits, availableGenres)
      : defaultRequestLimits(availableGenres);
  const requestRefreshMinutes =
    input.requestRefreshMinutes != null
      ? validateRequestRefreshMinutes(input.requestRefreshMinutes)
      : DEFAULT_REQUEST_REFRESH_MINUTES;
  const activationId = crypto.randomUUID();

  const { error: upsertError } = await supabaseServer
    .from("social_active_playlist")
    .upsert(
      {
        id: ACTIVE_ID,
        spotify_playlist_id: meta.id,
        playlist_url: meta.url,
        name: meta.name,
        activated_at: now,
        activation_id: activationId,
        request_refresh_minutes: requestRefreshMinutes,
        activated_by: input.activatedBy,
        is_active: true,
        request_limits: requestLimits,
        playlist_structure: structure,
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
    genre: genreForActivationPosition(position, t.id, masterGenre, pattern),
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

export async function updateSocialRequestLimits(input: {
  requestLimits: RequestLimits;
  requestRefreshMinutes?: RequestRefreshMinutes;
}): Promise<ActivePlaylistStatus> {
  const status = await getActivePlaylistStatus();
  if (!status.isActive) {
    throw new Error("No active playlist to update limits for");
  }

  const validated = validateRequestLimits(
    input.requestLimits,
    status.availableGenres
  );
  const now = new Date().toISOString();
  const patch: {
    request_limits: RequestLimits;
    updated_at: string;
    request_refresh_minutes?: RequestRefreshMinutes;
  } = {
    request_limits: validated,
    updated_at: now,
  };
  if (input.requestRefreshMinutes != null) {
    patch.request_refresh_minutes = validateRequestRefreshMinutes(
      input.requestRefreshMinutes
    );
  }
  const { error } = await supabaseServer
    .from("social_active_playlist")
    .update(patch)
    .eq("id", ACTIVE_ID);

  if (error) {
    throw new Error(`Failed to update request limits: ${error.message}`);
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

  const masters = await getMasterPlaylistRefsForGenres([input.genre]);
  const master = masters[0];
  if (!master) {
    throw new Error(`No master playlist for genre ${input.genre}`);
  }

  await addTracksToPlaylist(input.accessToken, master.spotifyPlaylistId, [
    input.track.uri,
  ]);
  await upsertMasterGenreRow(input.track.id, input.genre);
  invalidateMasterGenreCache();
  return { addedToMaster: true };
}
