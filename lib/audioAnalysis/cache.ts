import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeIsrc } from "@/lib/musicae/isrc";
import type { TrackAudioAnalysisRow } from "@/lib/musicae/types";
import { resolveAnalysisRowForTrack } from "@/lib/audioAnalysis/map";

export async function loadAnalysisByIsrcs(
  isrcs: string[]
): Promise<Map<string, TrackAudioAnalysisRow>> {
  const map = new Map<string, TrackAudioAnalysisRow>();
  if (isrcs.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < isrcs.length; i += chunkSize) {
    const chunk = isrcs.slice(i, i + chunkSize);
    const { data, error } = await supabaseServer
      .from("track_audio_analysis")
      .select("*")
      .in("isrc", chunk);
    if (error) {
      throw new Error(`Failed to load track_audio_analysis: ${error.message}`);
    }
    for (const row of data ?? []) {
      map.set(row.isrc, row as TrackAudioAnalysisRow);
    }
  }
  return map;
}

export async function loadAnalysisBySpotifyIds(
  spotifyIds: string[]
): Promise<Map<string, TrackAudioAnalysisRow>> {
  const map = new Map<string, TrackAudioAnalysisRow>();
  if (spotifyIds.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < spotifyIds.length; i += chunkSize) {
    const chunk = spotifyIds.slice(i, i + chunkSize);
    const { data, error } = await supabaseServer
      .from("track_audio_analysis")
      .select("*")
      .in("spotify_track_id", chunk);
    if (error) {
      throw new Error(
        `Failed to load track_audio_analysis by spotify id: ${error.message}`
      );
    }
    for (const row of data ?? []) {
      if (row.spotify_track_id) {
        map.set(row.spotify_track_id, row as TrackAudioAnalysisRow);
      }
    }
  }
  return map;
}

/** Cached analysis rows keyed by Spotify track id. */
export async function loadCachedAnalysisForTracks(
  tracks: Array<{ id: string; isrc?: string | null }>
): Promise<Map<string, TrackAudioAnalysisRow | null>> {
  const isrcs = [
    ...new Set(
      tracks
        .map((t) => normalizeIsrc(t.isrc))
        .filter((x): x is string => Boolean(x))
    ),
  ];
  const noIsrcIds = tracks
    .filter((t) => !normalizeIsrc(t.isrc))
    .map((t) => t.id);

  const byIsrc = await loadAnalysisByIsrcs(isrcs);
  const bySpotifyId = await loadAnalysisBySpotifyIds(noIsrcIds);

  const map = new Map<string, TrackAudioAnalysisRow | null>();
  for (const track of tracks) {
    map.set(
      track.id,
      resolveAnalysisRowForTrack(track, byIsrc, bySpotifyId)
    );
  }
  return map;
}
