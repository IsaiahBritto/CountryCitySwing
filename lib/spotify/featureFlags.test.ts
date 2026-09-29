import { describe, expect, it } from "vitest";
import {
  isRetryImmediatelyAnalysisError,
  needsAnalysisLookup,
} from "@/lib/spotify/featureFlags";
import type { TrackAudioAnalysisRow } from "@/lib/musicae/types";

function row(
  overrides: Partial<TrackAudioAnalysisRow>
): TrackAudioAnalysisRow {
  return {
    isrc: "USUM123",
    spotify_track_id: "abc",
    bpm: 120,
    half_time_bpm: null,
    double_time_bpm: null,
    time_signature: null,
    key_note: null,
    key_mode: null,
    camelot: null,
    open_key: null,
    loudness_db: null,
    danceability: 0.5,
    energy: 0.5,
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
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("needsAnalysisLookup", () => {
  it("retries complete rows missing BPM", () => {
    expect(
      needsAnalysisLookup(
        row({ analysis_status: "complete", bpm: null, energy: null }),
        "bpm_energy"
      )
    ).toBe(true);
  });

  it("skips complete rows with BPM and energy", () => {
    expect(needsAnalysisLookup(row(), "bpm_energy")).toBe(false);
  });
});

describe("isRetryImmediatelyAnalysisError", () => {
  it("matches batch parser failures", () => {
    expect(isRetryImmediatelyAnalysisError("unexpected_batch_shape")).toBe(
      true
    );
  });
});
