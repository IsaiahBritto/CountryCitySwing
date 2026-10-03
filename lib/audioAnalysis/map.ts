import type { ResolvedTrackFeatures } from "@/lib/spotify/curate";
import { FEATURE_DEFAULTS } from "@/lib/spotify/featureFlags";
import { normalizeIsrc } from "@/lib/musicae/isrc";
import type { TrackAudioAnalysisRow } from "@/lib/musicae/types";
import type { DeckTrackAnalysisStatus } from "@/lib/spotify/djDeckState";

export function resolveAnalysisRowForTrack(
  track: { id: string; isrc?: string | null },
  byIsrc: Map<string, TrackAudioAnalysisRow>,
  bySpotifyId: Map<string, TrackAudioAnalysisRow>
): TrackAudioAnalysisRow | null {
  const isrc = normalizeIsrc(track.isrc);
  if (isrc) {
    return byIsrc.get(isrc) ?? null;
  }
  return bySpotifyId.get(track.id) ?? null;
}

export function computeBpmAlt(row: TrackAudioAnalysisRow): number | null {
  if (row.analysis_status !== "complete") return null;
  const bpm = row.bpm;
  if (bpm == null) return null;
  if (row.half_time_bpm != null && row.half_time_bpm !== bpm) {
    return row.half_time_bpm;
  }
  if (row.double_time_bpm != null && row.double_time_bpm !== bpm) {
    return row.double_time_bpm;
  }
  return null;
}

export function analysisRowToResolvedFeatures(
  spotifyTrackId: string,
  row: TrackAudioAnalysisRow | null
): ResolvedTrackFeatures {
  if (!row || row.analysis_status !== "complete") {
    return {
      spotifyTrackId,
      bpm: FEATURE_DEFAULTS.bpm,
      bpmAlt: null,
      energy: FEATURE_DEFAULTS.energy,
      danceability: FEATURE_DEFAULTS.danceability,
      valence: FEATURE_DEFAULTS.valence,
      mood: FEATURE_DEFAULTS.mood,
      camelot: FEATURE_DEFAULTS.camelot,
      trueBpm: false,
      trueEnergy: false,
      trueDanceability: false,
      trueValence: false,
      trueMood: false,
      trueCamelot: false,
    };
  }

  const bpm = row.bpm;
  const energy = row.energy;
  const danceability = row.danceability;
  const valence = row.valence;
  const mood = row.mood_label;
  const camelot = row.camelot;

  return {
    spotifyTrackId,
    bpm: bpm ?? FEATURE_DEFAULTS.bpm,
    bpmAlt: computeBpmAlt(row),
    energy: energy ?? FEATURE_DEFAULTS.energy,
    danceability: danceability ?? FEATURE_DEFAULTS.danceability,
    valence: valence ?? FEATURE_DEFAULTS.valence,
    mood: mood ?? FEATURE_DEFAULTS.mood,
    camelot: camelot ?? FEATURE_DEFAULTS.camelot,
    trueBpm: bpm != null,
    trueEnergy: energy != null,
    trueDanceability: danceability != null,
    trueValence: valence != null,
    trueMood: mood != null,
    trueCamelot: camelot != null,
  };
}

export function analysisRowToDeckFields(row: TrackAudioAnalysisRow | null): {
  bpm?: number;
  analysisStatus?: DeckTrackAnalysisStatus;
} {
  if (!row) return {};

  if (row.analysis_status === "complete") {
    if (row.bpm != null && row.bpm > 0) {
      return {
        bpm: Math.round(row.bpm),
        analysisStatus: "complete",
      };
    }
    return { analysisStatus: "unavailable" };
  }

  if (
    row.analysis_status === "not_found" ||
    row.analysis_status === "missing_isrc" ||
    row.analysis_status === "temporary_error"
  ) {
    return { analysisStatus: "unavailable" };
  }

  return {};
}
