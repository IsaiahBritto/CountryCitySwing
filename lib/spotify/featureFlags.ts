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
