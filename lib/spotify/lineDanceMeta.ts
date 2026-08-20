import {
  isLineDanceLevel,
  type LineDanceLevel,
} from "@/lib/spotify/lineDanceLevels";
import {
  computeReviewerMetaMerge,
  lineDanceCompletionStatus,
  sortReviewRowsByTrackName,
  type LineDanceCompletionStatus,
  type ReviewerMetaInput,
} from "@/lib/spotify/lineDanceMetaLogic";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { fetchPlaylistTracks } from "@/lib/spotify/client";
import { getMasterPlaylistRefs } from "@/lib/spotify/masters";
import { supabaseServer } from "@/lib/supabaseServer";
import { isMissingRelationError } from "@/lib/supabaseErrors";

export type LineDanceMatchSource = "none" | "user" | "admin" | "reviewer";

export type LineDanceMetaRow = {
  spotify_track_id: string;
  track_name: string | null;
  primary_artist: string | null;
  line_dance_name: string | null;
  level: LineDanceLevel | null;
  level_raw: string | null;
  match_source: LineDanceMatchSource;
  needs_recheck: boolean;
  last_lookup_at: string | null;
  updated_at: string;
};

export type { LineDanceCompletionStatus, ReviewerMetaInput };
export { computeReviewerMetaMerge, lineDanceCompletionStatus };

function needsAssociation(
  row: Pick<
    LineDanceMetaRow,
    "match_source" | "line_dance_name" | "level" | "needs_recheck"
  >
): boolean {
  return (
    row.match_source !== "admin" ||
    !row.line_dance_name ||
    !row.level ||
    row.needs_recheck
  );
}

const META_UPSERT_BATCH = 200;
const TRACK_ID_UPSERT_BATCH = 500;

async function fetchLdMasterTracksFromSpotify() {
  const { accessToken } = await getValidAccessToken();
  const masters = await getMasterPlaylistRefs();
  const ld = masters.find((m) => m.genre === "ld");
  if (!ld) {
    throw new Error("Line dance master playlist not configured");
  }
  const tracks = await fetchPlaylistTracks(accessToken, ld.spotifyPlaylistId);
  return tracks;
}

async function bulkEnsureMetaRows(
  tracks: { id: string; name: string; primaryArtist: string }[]
): Promise<void> {
  if (tracks.length === 0) return;

  const trackIds = tracks.map((t) => t.id);
  const { data: existingRows, error: loadError } = await supabaseServer
    .from("spotify_line_dance_meta")
    .select("*")
    .in("spotify_track_id", trackIds);

  if (loadError) {
    throw new Error(`Failed to load LD meta for sync: ${loadError.message}`);
  }

  const byId = new Map(
    ((existingRows ?? []) as LineDanceMetaRow[]).map((row) => [
      row.spotify_track_id,
      row,
    ])
  );
  const now = new Date().toISOString();

  const payloads = tracks.map((track) => {
    const existing = byId.get(track.id);
    if (existing) {
      return {
        ...existing,
        track_name: track.name,
        primary_artist: track.primaryArtist,
        updated_at: now,
      };
    }
    return {
      spotify_track_id: track.id,
      track_name: track.name,
      primary_artist: track.primaryArtist,
      match_source: "none" as const,
      needs_recheck: true,
      updated_at: now,
    };
  });

  for (let i = 0; i < payloads.length; i += META_UPSERT_BATCH) {
    const batch = payloads.slice(i, i + META_UPSERT_BATCH);
    const { error } = await supabaseServer
      .from("spotify_line_dance_meta")
      .upsert(batch, { onConflict: "spotify_track_id" });
    if (error) {
      throw new Error(`Failed to bulk upsert LD meta: ${error.message}`);
    }
  }
}

async function replaceLdMasterTrackIds(trackIds: string[]): Promise<void> {
  const { error: deleteError } = await supabaseServer
    .from("spotify_ld_master_track_ids")
    .delete()
    .neq("spotify_track_id", "");
  if (deleteError) {
    if (isMissingRelationError(deleteError)) return;
    throw new Error(`Failed to clear LD master track ids: ${deleteError.message}`);
  }

  if (trackIds.length === 0) return;

  const now = new Date().toISOString();
  for (let i = 0; i < trackIds.length; i += TRACK_ID_UPSERT_BATCH) {
    const batch = trackIds.slice(i, i + TRACK_ID_UPSERT_BATCH).map((id) => ({
      spotify_track_id: id,
      synced_at: now,
    }));
    const { error } = await supabaseServer
      .from("spotify_ld_master_track_ids")
      .insert(batch);
    if (error) {
      if (isMissingRelationError(error)) return;
      throw new Error(`Failed to save LD master track ids: ${error.message}`);
    }
  }
}

async function loadMetaRowsForTrackIds(
  trackIds: string[]
): Promise<LineDanceMetaRow[]> {
  if (trackIds.length === 0) return [];

  const rows: LineDanceMetaRow[] = [];
  for (let i = 0; i < trackIds.length; i += META_UPSERT_BATCH) {
    const batch = trackIds.slice(i, i + META_UPSERT_BATCH);
    const { data, error } = await supabaseServer
      .from("spotify_line_dance_meta")
      .select("*")
      .in("spotify_track_id", batch);
    if (error) {
      throw new Error(`Failed to list line dance meta: ${error.message}`);
    }
    rows.push(...((data ?? []) as LineDanceMetaRow[]));
  }

  return sortReviewRowsByTrackName(rows);
}

/** Fetch Spotify LD master playlist, bulk-upsert meta stubs, refresh track-id snapshot. */
export async function syncLdMasterFromSpotify(): Promise<{
  rows: LineDanceMetaRow[];
  syncedAt: string;
}> {
  const tracks = await fetchLdMasterTracksFromSpotify();
  await bulkEnsureMetaRows(tracks);
  const trackIds = tracks.map((t) => t.id);
  await replaceLdMasterTrackIds(trackIds);
  const rows = await loadMetaRowsForTrackIds(trackIds);
  return { rows, syncedAt: new Date().toISOString() };
}

async function loadLdMasterMetaFromDb(): Promise<{
  rows: LineDanceMetaRow[];
  snapshotAvailable: boolean;
}> {
  const { data: idRows, error: idError } = await supabaseServer
    .from("spotify_ld_master_track_ids")
    .select("spotify_track_id");

  if (idError) {
    if (isMissingRelationError(idError)) {
      return { rows: [], snapshotAvailable: false };
    }
    throw new Error(`Failed to load LD master track ids: ${idError.message}`);
  }

  const trackIds = (idRows ?? []).map(
    (row) => row.spotify_track_id as string
  );
  return {
    rows: await loadMetaRowsForTrackIds(trackIds),
    snapshotAvailable: true,
  };
}

/** @deprecated Prefer syncLdMasterFromSpotify + loadLdMasterMetaFromDb */
async function loadLdMasterMetaRows(): Promise<LineDanceMetaRow[]> {
  const { rows } = await syncLdMasterFromSpotify();
  return rows;
}

export async function ensureMetaRow(input: {
  spotifyTrackId: string;
  trackName: string;
  primaryArtist: string;
}): Promise<LineDanceMetaRow> {
  const now = new Date().toISOString();
  const { data: existing } = await supabaseServer
    .from("spotify_line_dance_meta")
    .select("*")
    .eq("spotify_track_id", input.spotifyTrackId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseServer
      .from("spotify_line_dance_meta")
      .update({
        track_name: input.trackName,
        primary_artist: input.primaryArtist,
        updated_at: now,
      })
      .eq("spotify_track_id", input.spotifyTrackId)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update LD meta: ${error.message}`);
    return data as LineDanceMetaRow;
  }

  const { data, error } = await supabaseServer
    .from("spotify_line_dance_meta")
    .insert({
      spotify_track_id: input.spotifyTrackId,
      track_name: input.trackName,
      primary_artist: input.primaryArtist,
      match_source: "none",
      needs_recheck: true,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create LD meta: ${error.message}`);
  return data as LineDanceMetaRow;
}

export async function confirmAsAdmin(input: {
  trackId: string;
  lineDanceName: string;
  level: LineDanceLevel;
  levelRaw?: string | null;
  trackName?: string | null;
  primaryArtist?: string | null;
}): Promise<LineDanceMetaRow> {
  const name = input.lineDanceName.trim();
  if (!name) throw new Error("lineDanceName is required");
  if (!isLineDanceLevel(input.level)) throw new Error("Invalid level");

  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("spotify_line_dance_meta")
    .upsert(
      {
        spotify_track_id: input.trackId,
        track_name: input.trackName ?? null,
        primary_artist: input.primaryArtist ?? null,
        line_dance_name: name,
        level: input.level,
        level_raw: input.levelRaw?.trim() || input.level,
        match_source: "admin",
        needs_recheck: false,
        updated_at: now,
      },
      { onConflict: "spotify_track_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to confirm LD meta: ${error.message}`);
  return data as LineDanceMetaRow;
}

export async function saveReviewerMeta(input: {
  trackId: string;
  lineDanceName?: string | null;
  level?: string | null;
  trackName?: string | null;
  primaryArtist?: string | null;
}): Promise<LineDanceMetaRow> {
  const trackId = input.trackId.trim();
  if (!trackId) throw new Error("trackId is required");

  if (input.trackName && input.primaryArtist) {
    await ensureMetaRow({
      spotifyTrackId: trackId,
      trackName: input.trackName,
      primaryArtist: input.primaryArtist,
    });
  }

  const { data: existing, error: loadError } = await supabaseServer
    .from("spotify_line_dance_meta")
    .select("*")
    .eq("spotify_track_id", trackId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load LD meta: ${loadError.message}`);
  }
  if (!existing) {
    throw new Error("Track not found in line dance meta");
  }

  const merge = computeReviewerMetaMerge(existing as LineDanceMetaRow, {
    lineDanceName: input.lineDanceName,
    level: input.level,
  });
  if (!merge.ok) {
    throw new Error(merge.reason);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("spotify_line_dance_meta")
    .update({
      track_name: input.trackName ?? existing.track_name,
      primary_artist: input.primaryArtist ?? existing.primary_artist,
      line_dance_name: merge.line_dance_name,
      level: merge.level,
      level_raw: merge.level_raw,
      match_source: "reviewer",
      needs_recheck: merge.needs_recheck,
      updated_at: now,
    })
    .eq("spotify_track_id", trackId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save reviewer LD meta: ${error.message}`);
  return data as LineDanceMetaRow;
}

export async function applyUserProvisional(input: {
  trackId: string;
  trackName: string;
  primaryArtist: string;
  lineDanceName?: string | null;
  level?: string | null;
}): Promise<LineDanceMetaRow | null> {
  const meta = await ensureMetaRow({
    spotifyTrackId: input.trackId,
    trackName: input.trackName,
    primaryArtist: input.primaryArtist,
  });

  if (meta.match_source === "admin") {
    return meta;
  }

  const name =
    typeof input.lineDanceName === "string" && input.lineDanceName.trim()
      ? input.lineDanceName.trim()
      : null;
  const levelRaw =
    typeof input.level === "string" && input.level.trim()
      ? input.level.trim()
      : null;
  const level = levelRaw && isLineDanceLevel(levelRaw) ? levelRaw : null;

  if (!name && !level) return meta;

  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("spotify_line_dance_meta")
    .update({
      line_dance_name: name ?? meta.line_dance_name,
      level: level ?? meta.level,
      level_raw: levelRaw ?? meta.level_raw,
      match_source: "user",
      needs_recheck: true,
      updated_at: now,
    })
    .eq("spotify_track_id", input.trackId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save user LD meta: ${error.message}`);
  return data as LineDanceMetaRow;
}

/**
 * Load LD master playlist tracks, ensure meta stubs exist, return songs that
 * still need an admin-confirmed line dance association.
 */
export async function listUnassociatedFromMaster(input?: {
  limit?: number;
  offset?: number;
}): Promise<{ rows: LineDanceMetaRow[]; total: number }> {
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const offset = Math.max(input?.offset ?? 0, 0);

  const allRows = await loadLdMasterMetaRows();
  const unassociated = allRows
    .filter(needsAssociation)
    .sort((a, b) =>
      (a.track_name ?? "").localeCompare(b.track_name ?? "", undefined, {
        sensitivity: "base",
      })
    );

  return {
    total: unassociated.length,
    rows: unassociated.slice(offset, offset + limit),
  };
}

/**
 * Load all LD master playlist tracks with meta for reviewer classification.
 * When sync is false, reads from DB only (fast). When true, refreshes from Spotify first.
 */
export async function listAllFromMaster(input?: {
  sync?: boolean;
}): Promise<{
  rows: LineDanceMetaRow[];
  needsSync: boolean;
  syncedAt: string | null;
}> {
  if (input?.sync) {
    const { rows, syncedAt } = await syncLdMasterFromSpotify();
    return { rows, needsSync: false, syncedAt };
  }

  const { rows, snapshotAvailable } = await loadLdMasterMetaFromDb();
  if (!snapshotAvailable || rows.length === 0) {
    return { rows: [], needsSync: true, syncedAt: null };
  }

  const { data: latest, error: syncedError } = await supabaseServer
    .from("spotify_ld_master_track_ids")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    rows,
    needsSync: false,
    syncedAt: isMissingRelationError(syncedError)
      ? null
      : ((latest?.synced_at as string | undefined) ?? null),
  };
}
