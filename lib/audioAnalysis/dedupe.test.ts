import { describe, expect, it } from "vitest";
import { dedupeAnalysisRowsByIsrc } from "@/lib/audioAnalysis/dedupe";
import type { TrackAudioAnalysisRow } from "@/lib/musicae/types";

function row(
  overrides: Partial<TrackAudioAnalysisRow> & Pick<TrackAudioAnalysisRow, "isrc">
): TrackAudioAnalysisRow {
  return {
    spotify_track_id: "track-a",
    bpm: 120,
    half_time_bpm: null,
    double_time_bpm: null,
    time_signature: null,
    key_note: null,
    key_mode: null,
    camelot: null,
    open_key: null,
    loudness_db: null,
    danceability: null,
    energy: null,
    speechiness: null,
    acousticness: null,
    instrumentalness: null,
    liveness: null,
    valence: null,
    dance_floor: null,
    chill: null,
    aggressive: null,
    hype: null,
    groove: null,
    warmup: null,
    peak_time: null,
    blendability: null,
    vocal_risk: null,
    mood_label: null,
    mood_vector: null,
    genres: null,
    provider: "musicae",
    raw_response: null,
    analysis_status: "complete",
    last_error: null,
    analyzed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("dedupeAnalysisRowsByIsrc", () => {
  it("keeps one row when two Spotify tracks share the same ISRC", () => {
    const isrc = "USWB12100255";
    const deduped = dedupeAnalysisRowsByIsrc([
      row({ isrc, spotify_track_id: "spotify-1", bpm: 129 }),
      row({ isrc, spotify_track_id: "spotify-2", bpm: 129 }),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.isrc).toBe(isrc);
    expect(deduped[0]?.spotify_track_id).toBe("spotify-1");
  });

  it("normalizes ISRC casing when deduping", () => {
    const deduped = dedupeAnalysisRowsByIsrc([
      row({ isrc: "uscgj1140724", spotify_track_id: "a" }),
      row({ isrc: "USCGJ1140724", spotify_track_id: "b" }),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.spotify_track_id).toBe("a");
  });

  it("keeps distinct synthetic Spotify cache keys", () => {
    const deduped = dedupeAnalysisRowsByIsrc([
      row({
        isrc: "SPOTIFY:id-one",
        spotify_track_id: "id-one",
        analysis_status: "missing_isrc",
      }),
      row({
        isrc: "SPOTIFY:id-two",
        spotify_track_id: "id-two",
        analysis_status: "missing_isrc",
      }),
    ]);
    expect(deduped).toHaveLength(2);
  });

  it("prefers complete over temporary_error for the same ISRC", () => {
    const isrc = "USAT22400747";
    const deduped = dedupeAnalysisRowsByIsrc([
      row({
        isrc,
        spotify_track_id: "first",
        analysis_status: "temporary_error",
        bpm: null,
        last_error: "timeout",
      }),
      row({
        isrc,
        spotify_track_id: "second",
        analysis_status: "complete",
        bpm: 116,
      }),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.analysis_status).toBe("complete");
    expect(deduped[0]?.spotify_track_id).toBe("second");
  });
});
