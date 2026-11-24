import { fetchLibraryPlaylistTracks } from "@/lib/appleMusic/client";
import { getMusicServiceAccess } from "@/lib/music/serviceAccess";
import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  buildMasterIsrcGenreMap,
  invalidateMasterIsrcGenreCache,
  lookupMasterGenreByIsrc,
  resolveGenreForAppleTrack,
} from "@/lib/spotify/masterIsrcGenreMap";
import { tryGetSpotifyAccessTokenForMasters } from "@/lib/spotify/masterServiceAccess";
import {
  addTracksToPlaylist,
  fetchPlaylistMeta,
  fetchPlaylistTracks,
  fetchPlaylistTracksWithPositions,
  fetchTrackIsrc,
  type SpotifyTrack,
} from "@/lib/spotify/client";
import { normalizeIsrc } from "@/lib/musicae/isrc";
import { buildCanonicalTrackByIsrc } from "@/lib/spotify/masterIsrcIndex";
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
import { isServerAppleMusic } from "@/lib/music/serverProvider";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  activeCatalogPlaylistId,
  snapshotRowTrackId,
} from "@/lib/spotify/activeCatalogPlaylist";

export { activeCatalogPlaylistId, snapshotRowTrackId };

export type ActivePlaylistStatus = {
  isActive: boolean;
  spotifyPlaylistId: string | null;
  appleMusicPlaylistId: string | null;
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
  catalog_track_id?: string | null;
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
  apple_music_playlist_id?: string | null;
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
    appleMusicPlaylistId: data.apple_music_playlist_id ?? null,
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
      "is_active, spotify_playlist_id, apple_music_playlist_id, playlist_url, name, activated_at, activation_id, request_refresh_minutes, request_limits, playlist_structure"
    )
    .eq("id", ACTIVE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active playlist: ${error.message}`);
  }

  const inactiveAvailable = structureAvailableGenres(DEFAULT_SOCIAL_STRUCTURE);

  const playlistId =
    data?.apple_music_playlist_id ?? data?.spotify_playlist_id ?? null;
  const appleActive = await isServerAppleMusic();
  const requiresPlaylist = appleActive ? !playlistId : !data?.spotify_playlist_id;

  if (!data || !data.is_active || requiresPlaylist) {
    return {
      isActive: false,
      spotifyPlaylistId: null,
      appleMusicPlaylistId: null,
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
  invalidateMasterIsrcGenreCache();
}

export async function lookupTrackGenreInMasters(
  trackId: string,
  options?: { isrc?: string | null }
): Promise<GenrePool | null> {
  const fromDb = await lookupMasterGenreFromDb(trackId);
  if (fromDb) return fromDb;

  const spotifyAccessToken = await tryGetSpotifyAccessTokenForMasters();
  if (!spotifyAccessToken) return null;

  const normalizedIsrc = normalizeIsrc(options?.isrc);
  if (normalizedIsrc) {
    const fromIsrc = await lookupMasterGenreByIsrc(
      normalizedIsrc,
      spotifyAccessToken
    );
    if (fromIsrc) return fromIsrc;
  }

  try {
    const map = await buildMasterGenreMap(spotifyAccessToken);
    return map.get(trackId) ?? null;
  } catch {
    return null;
  }
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

export async function activateAppleSocialPlaylist(input: {
  playlistId: string;
  playlistName?: string | null;
  activatedBy: string | null;
  requestLimits?: RequestLimits | null;
  requestRefreshMinutes?: RequestRefreshMinutes;
  structure: PlaylistStructure;
}): Promise<ActivePlaylistStatus> {
  const playlistId = input.playlistId.trim();
  if (!playlistId) {
    throw new Error("Apple Music playlist id is required");
  }

  const serviceAccess = await getMusicServiceAccess();
  if (serviceAccess.provider !== "apple_music") {
    throw new Error("Apple Music is not the active music provider");
  }

  const { tracks } = await fetchLibraryPlaylistTracks({
    developerToken: serviceAccess.developerToken,
    musicUserToken: serviceAccess.musicUserToken,
    playlistId,
  });
  if (tracks.length === 0) {
    throw new Error("Playlist has no playable tracks");
  }

  const spotifyToken = await tryGetSpotifyAccessTokenForMasters();
  const idGenreMap = spotifyToken
    ? await buildMasterGenreMap(spotifyToken)
    : new Map<string, GenrePool>();
  const isrcGenreMap = spotifyToken
    ? await buildMasterIsrcGenreMap(spotifyToken)
    : new Map<string, GenrePool>();

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
  const playlistName = input.playlistName?.trim() || "Apple Music playlist";

  const { error: upsertError } = await supabaseServer
    .from("social_active_playlist")
    .upsert(
      {
        id: ACTIVE_ID,
        music_provider: "apple_music",
        spotify_playlist_id: null,
        apple_music_playlist_id: playlistId,
        playlist_url: null,
        name: playlistName,
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
    genre: resolveGenreForAppleTrack({
      position,
      trackId: t.id,
      isrc: t.isrc,
      isrcGenreMap,
      idGenreMap,
      pattern,
    }),
    source: "generated" as const,
    updated_at: now,
  }));

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
  spotifyAccessToken: string;
  track: SpotifyTrack | { id: string; uri: string; isrc?: string | null };
  genre: GenrePool;
  masterGenreMap?: Map<string, GenrePool>;
}): Promise<{ addedToMaster: boolean }> {
  const map =
    input.masterGenreMap ??
    (await buildMasterGenreMap(input.spotifyAccessToken));
  const existingGenre = map.get(input.track.id);
  if (existingGenre === input.genre) {
    return { addedToMaster: false };
  }

  const masters = await getMasterPlaylistRefsForGenres([input.genre]);
  const master = masters[0];
  if (!master) {
    throw new Error(`No master playlist for genre ${input.genre}`);
  }

  const masterItems = await fetchPlaylistTracksWithPositions(
    input.spotifyAccessToken,
    master.spotifyPlaylistId
  );
  const canonicalByIsrc = buildCanonicalTrackByIsrc(masterItems);

  let requestIsrc = normalizeIsrc(
    "isrc" in input.track ? input.track.isrc : null
  );
  if (!requestIsrc && input.track.uri.startsWith("spotify:")) {
    try {
      requestIsrc = normalizeIsrc(
        await fetchTrackIsrc(input.spotifyAccessToken, input.track.id)
      );
    } catch {
      requestIsrc = null;
    }
  }

  if (requestIsrc) {
    const canonical = canonicalByIsrc.get(requestIsrc);
    if (canonical) {
      if (canonical.id !== input.track.id) {
        await upsertMasterGenreRow(canonical.id, input.genre);
      }
      return { addedToMaster: false };
    }
  }

  let uriToAdd = input.track.uri;
  if (!uriToAdd.startsWith("spotify:")) {
    return { addedToMaster: false };
  }

  await addTracksToPlaylist(input.spotifyAccessToken, master.spotifyPlaylistId, [
    uriToAdd,
  ]);
  await upsertMasterGenreRow(input.track.id, input.genre);
  invalidateMasterGenreCache();
  return { addedToMaster: true };
}
