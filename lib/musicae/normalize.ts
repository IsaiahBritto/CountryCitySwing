import { normalizeIsrc } from "@/lib/musicae/isrc";
import type {
  MusicaeAnalysisResponse,
  MusicaeAnalysisStatus,
  TrackAudioAnalysis,
  TrackAudioAnalysisRow,
} from "@/lib/musicae/types";

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function analysisFromMusicaeResponse(
  response: MusicaeAnalysisResponse,
  fallbackIsrc: string | null
): TrackAudioAnalysis | null {
  const isrc =
    normalizeIsrc(response.track?.ids?.isrc) ?? fallbackIsrc ?? null;
  if (!isrc) return null;

  const spotifyId =
    typeof response.track?.ids?.spotify === "string"
      ? response.track.ids.spotify
      : undefined;

  const moodLabel =
    typeof response.mood?.label === "string" && response.mood.label.trim()
      ? response.mood.label.trim().toLowerCase()
      : undefined;

  return {
    isrc,
    spotifyTrackId: spotifyId,
    bpm: numOrNull(response.rhythm?.bpm) ?? undefined,
    halfTimeBpm: numOrNull(response.rhythm?.half_time_bpm) ?? undefined,
    doubleTimeBpm: numOrNull(response.rhythm?.double_time_bpm) ?? undefined,
    timeSignature:
      typeof response.rhythm?.time_signature === "string"
        ? response.rhythm.time_signature
        : undefined,
    keyNote:
      typeof response.harmony?.note === "string"
        ? response.harmony.note
        : undefined,
    keyMode:
      typeof response.harmony?.mode === "string"
        ? response.harmony.mode
        : undefined,
    camelot:
      typeof response.harmony?.camelot === "string"
        ? response.harmony.camelot
        : undefined,
    openKey:
      typeof response.harmony?.open_key === "string"
        ? response.harmony.open_key
        : undefined,
    loudnessDb: numOrNull(response.track?.loudness_db) ?? undefined,
    danceability: numOrNull(response.score?.danceability) ?? undefined,
    energy: numOrNull(response.score?.energy) ?? undefined,
    speechiness: numOrNull(response.score?.speechiness) ?? undefined,
    acousticness: numOrNull(response.score?.acousticness) ?? undefined,
    instrumentalness: numOrNull(response.score?.instrumentalness) ?? undefined,
    liveness: numOrNull(response.score?.liveness) ?? undefined,
    valence: numOrNull(response.score?.valence) ?? undefined,
    danceFloor: numOrNull(response.score?.dance_floor) ?? undefined,
    chill: numOrNull(response.score?.chill) ?? undefined,
    aggressive: numOrNull(response.score?.aggressive) ?? undefined,
    hype: numOrNull(response.score?.hype) ?? undefined,
    groove: numOrNull(response.score?.groove) ?? undefined,
    warmup: numOrNull(response.score?.warmup) ?? undefined,
    peakTime: numOrNull(response.score?.peak_time) ?? undefined,
    blendability: numOrNull(response.score?.blendability) ?? undefined,
    vocalRisk: numOrNull(response.score?.vocal_risk) ?? undefined,
    moodLabel,
    moodVector: response.mood?.vector ?? undefined,
    genres: Array.isArray(response.genres) ? response.genres : undefined,
    provider: "musicae",
  };
}

export function toAnalysisRow(input: {
  analysis: TrackAudioAnalysis | null;
  status: MusicaeAnalysisStatus;
  rawResponse: MusicaeAnalysisResponse | null;
  lastError: string | null;
  isrc: string;
  spotifyTrackId: string | null;
}): TrackAudioAnalysisRow {
  const now = new Date().toISOString();
  const a = input.analysis;
  return {
    isrc: input.isrc,
    spotify_track_id: a?.spotifyTrackId ?? input.spotifyTrackId,
    bpm: a?.bpm ?? null,
    half_time_bpm: a?.halfTimeBpm ?? null,
    double_time_bpm: a?.doubleTimeBpm ?? null,
    time_signature: a?.timeSignature ?? null,
    key_note: a?.keyNote ?? null,
    key_mode: a?.keyMode ?? null,
    camelot: a?.camelot ?? null,
    open_key: a?.openKey ?? null,
    loudness_db: a?.loudnessDb ?? null,
    danceability: a?.danceability ?? null,
    energy: a?.energy ?? null,
    speechiness: a?.speechiness ?? null,
    acousticness: a?.acousticness ?? null,
    instrumentalness: a?.instrumentalness ?? null,
    liveness: a?.liveness ?? null,
    valence: a?.valence ?? null,
    dance_floor: a?.danceFloor ?? null,
    chill: a?.chill ?? null,
    aggressive: a?.aggressive ?? null,
    hype: a?.hype ?? null,
    groove: a?.groove ?? null,
    warmup: a?.warmup ?? null,
    peak_time: a?.peakTime ?? null,
    blendability: a?.blendability ?? null,
    vocal_risk: a?.vocalRisk ?? null,
    mood_label: a?.moodLabel ?? null,
    mood_vector: a?.moodVector ?? null,
    genres: a?.genres ?? null,
    provider: "musicae",
    raw_response: input.rawResponse,
    analysis_status: input.status,
    last_error: input.lastError,
    analyzed_at: input.status === "complete" ? now : null,
    created_at: now,
    updated_at: now,
  };
}

export function rowToTrackAudioAnalysis(
  row: TrackAudioAnalysisRow
): TrackAudioAnalysis | null {
  if (row.analysis_status !== "complete") return null;
  return {
    isrc: row.isrc,
    spotifyTrackId: row.spotify_track_id ?? undefined,
    bpm: row.bpm ?? undefined,
    halfTimeBpm: row.half_time_bpm ?? undefined,
    doubleTimeBpm: row.double_time_bpm ?? undefined,
    timeSignature: row.time_signature ?? undefined,
    keyNote: row.key_note ?? undefined,
    keyMode: row.key_mode ?? undefined,
    camelot: row.camelot ?? undefined,
    openKey: row.open_key ?? undefined,
    loudnessDb: row.loudness_db ?? undefined,
    danceability: row.danceability ?? undefined,
    energy: row.energy ?? undefined,
    speechiness: row.speechiness ?? undefined,
    acousticness: row.acousticness ?? undefined,
    instrumentalness: row.instrumentalness ?? undefined,
    liveness: row.liveness ?? undefined,
    valence: row.valence ?? undefined,
    danceFloor: row.dance_floor ?? undefined,
    chill: row.chill ?? undefined,
    aggressive: row.aggressive ?? undefined,
    hype: row.hype ?? undefined,
    groove: row.groove ?? undefined,
    warmup: row.warmup ?? undefined,
    peakTime: row.peak_time ?? undefined,
    blendability: row.blendability ?? undefined,
    vocalRisk: row.vocal_risk ?? undefined,
    moodLabel: row.mood_label ?? undefined,
    moodVector: row.mood_vector ?? undefined,
    genres: row.genres ?? undefined,
    provider: "musicae",
  };
}
