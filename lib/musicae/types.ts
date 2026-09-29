export type MusicaeAnalysisStatus =
  | "complete"
  | "not_found"
  | "missing_isrc"
  | "temporary_error";

export type MusicaeTrackSection = {
  ids?: { spotify?: string; isrc?: string };
  name?: string;
  duration_ms?: number;
  loudness_db?: number;
  is_vocal_heavy?: boolean;
  is_acoustic?: boolean;
  is_instrumental?: boolean;
  is_live_recording?: boolean;
  is_club_loud?: boolean;
};

export type MusicaeRhythmSection = {
  bpm?: number;
  bucket?: string;
  beats?: number;
  beats_per_bar?: number;
  beat_duration_ms?: number;
  bars?: number;
  time_signature?: string;
  half_time_bpm?: number;
  double_time_bpm?: number;
  phrases_s?: Record<string, number>;
  phrases_count?: Record<string, number>;
};

export type MusicaeHarmonySection = {
  key?: number;
  mode?: string;
  note?: string;
  camelot?: string;
  camelot_number?: number;
  camelot_letter?: string;
  open_key?: string;
};

export type MusicaeScoreSection = {
  danceability?: number;
  energy?: number;
  speechiness?: number;
  acousticness?: number;
  instrumentalness?: number;
  liveness?: number;
  valence?: number;
  dance_floor?: number;
  chill?: number;
  aggressive?: number;
  hype?: number;
  groove?: number;
  warmup?: number;
  peak_time?: number;
  blendability?: number;
  vocal_risk?: number;
};

export type MusicaeMoodSection = {
  label?: string;
  vector?: Record<string, number>;
};

export type MusicaeAnalysisResponse = {
  track?: MusicaeTrackSection;
  rhythm?: MusicaeRhythmSection;
  harmony?: MusicaeHarmonySection;
  score?: MusicaeScoreSection;
  mood?: MusicaeMoodSection;
  genres?: string[];
};

export type TrackAudioAnalysis = {
  isrc: string;
  spotifyTrackId?: string;
  bpm?: number;
  halfTimeBpm?: number;
  doubleTimeBpm?: number;
  timeSignature?: string;
  keyNote?: string;
  keyMode?: string;
  camelot?: string;
  openKey?: string;
  loudnessDb?: number;
  danceability?: number;
  energy?: number;
  speechiness?: number;
  acousticness?: number;
  instrumentalness?: number;
  liveness?: number;
  valence?: number;
  danceFloor?: number;
  chill?: number;
  aggressive?: number;
  hype?: number;
  groove?: number;
  warmup?: number;
  peakTime?: number;
  blendability?: number;
  vocalRisk?: number;
  moodLabel?: string;
  moodVector?: Record<string, number>;
  genres?: string[];
  provider: "musicae";
};

export type TrackAudioAnalysisRow = {
  isrc: string;
  spotify_track_id: string | null;
  bpm: number | null;
  half_time_bpm: number | null;
  double_time_bpm: number | null;
  time_signature: string | null;
  key_note: string | null;
  key_mode: string | null;
  camelot: string | null;
  open_key: string | null;
  loudness_db: number | null;
  danceability: number | null;
  energy: number | null;
  speechiness: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  liveness: number | null;
  valence: number | null;
  dance_floor: number | null;
  chill: number | null;
  aggressive: number | null;
  hype: number | null;
  groove: number | null;
  warmup: number | null;
  peak_time: number | null;
  blendability: number | null;
  vocal_risk: number | null;
  mood_label: string | null;
  mood_vector: Record<string, number> | null;
  genres: string[] | null;
  provider: string;
  raw_response: MusicaeAnalysisResponse | null;
  analysis_status: MusicaeAnalysisStatus;
  last_error: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
};
