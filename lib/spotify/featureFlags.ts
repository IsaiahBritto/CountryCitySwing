import type { TrackAudioAnalysisRow } from "@/lib/musicae/types";
import type { SpotifyTrack } from "@/lib/spotify/client";

export type TrackFeaturesRow = {
  spotify_track_id: string;
  isrc: string | null;
  name: string | null;
  primary_artist: string | null;
  itunes_track_id: string | null;
  bpm: number;
  true_bpm: boolean;
  bpm_alt: number | null;
  energy: number;
  true_energy: boolean;
  danceability: number;
  true_danceability: boolean;
  valence: number;
  true_valence: boolean;
  mood: string;
  true_mood: boolean;
  camelot: string | null;
  true_camelot: boolean;
  last_lookup_at: string;
  updated_at: string;
  analysis_provider?: string | null;
};

export const FEATURE_DEFAULTS = {
  bpm: 100,
  energy: 0.5,
  danceability: 0.5,
  valence: 0.5,
  mood: "neutral",
  camelot: null as string | null,
} as const;

export type FeatureRetryMode = "all_flags" | "bpm_energy";

/** Sync path: retry if any feature flag is incomplete. */
export function needsFeatureLookup(
  row: TrackFeaturesRow | null | undefined
): boolean {
  if (!row) return true;
  return (
    !row.true_bpm ||
    !row.true_energy ||
    !row.true_danceability ||
    !row.true_valence ||
    !row.true_mood ||
    !row.true_camelot
  );
}

/** Generate path: only retry when BPM or energy is missing. */
export function needsBpmOrEnergyLookup(
  row: TrackFeaturesRow | null | undefined
): boolean {
  if (!row) return true;
  return !row.true_bpm || !row.true_energy;
}

export function selectTracksNeedingLookup(
  tracks: SpotifyTrack[],
  cached: Map<string, TrackFeaturesRow>,
  retryMode: FeatureRetryMode = "all_flags"
): SpotifyTrack[] {
  const needs =
    retryMode === "bpm_energy" ? needsBpmOrEnergyLookup : needsFeatureLookup;
  return tracks.filter((t) => needs(cached.get(t.id)));
}

/** Musicae cache: retry when row missing or not complete. */
export function needsAnalysisLookup(
  row: TrackAudioAnalysisRow | null | undefined,
  retryMode: FeatureRetryMode = "all_flags"
): boolean {
  if (!row || row.analysis_status !== "complete") return true;
  if (retryMode === "bpm_energy") {
    return row.bpm == null || row.energy == null;
  }
  return (
    row.bpm == null ||
    row.energy == null ||
    row.danceability == null ||
    row.valence == null ||
    row.mood_label == null ||
    row.camelot == null
  );
}

/** Errors that should not block the next Musicae attempt (e.g. our parser bug). */
export function isRetryImmediatelyAnalysisError(lastError: string | null): boolean {
  if (!lastError) return false;
  return (
    lastError === "unexpected_batch_shape" ||
    lastError === "invalid_batch_entry" ||
    lastError === "provider_unavailable"
  );
}

export function selectTracksNeedingAnalysisLookup(
  tracks: SpotifyTrack[],
  cached: Map<string, TrackAudioAnalysisRow | null>,
  retryMode: FeatureRetryMode = "all_flags"
): SpotifyTrack[] {
  return tracks.filter((t) =>
    needsAnalysisLookup(cached.get(t.id) ?? null, retryMode)
  );
}
