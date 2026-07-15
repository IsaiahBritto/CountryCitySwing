import {
  isLineDanceLevel,
  type LineDanceLevel,
} from "@/lib/spotify/lineDanceLevels";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { fetchPlaylistTracks } from "@/lib/spotify/client";
import { getMasterPlaylistRefs } from "@/lib/spotify/masters";
import { supabaseServer } from "@/lib/supabaseServer";

export type LineDanceMatchSource = "none" | "user" | "admin";

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

  const { accessToken } = await getValidAccessToken();
  const masters = await getMasterPlaylistRefs();
  const ld = masters.find((m) => m.genre === "ld");
  if (!ld) {
    throw new Error("Line dance master playlist not configured");
  }

  const tracks = await fetchPlaylistTracks(accessToken, ld.spotifyPlaylistId);
  for (const track of tracks) {
    await ensureMetaRow({
      spotifyTrackId: track.id,
      trackName: track.name,
      primaryArtist: track.primaryArtist,
    });
  }

  const trackIds = tracks.map((t) => t.id);
  if (trackIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const { data, error } = await supabaseServer
    .from("spotify_line_dance_meta")
    .select("*")
    .in("spotify_track_id", trackIds);

  if (error) {
    throw new Error(`Failed to list line dance meta: ${error.message}`);
  }

  const unassociated = ((data ?? []) as LineDanceMetaRow[])
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
