import { describe, expect, it } from "vitest";
import {
  analysisRowToDeckFields,
  analysisRowToResolvedFeatures,
  computeBpmAlt,
} from "@/lib/audioAnalysis/map";
import type { TrackAudioAnalysisRow } from "@/lib/musicae/types";

function baseRow(
  overrides: Partial<TrackAudioAnalysisRow> = {}
): TrackAudioAnalysisRow {
  return {
    isrc: "GBDUW0000053",
    spotify_track_id: "abc123",
    bpm: 128.4,
    half_time_bpm: 64.2,
    double_time_bpm: 256.8,
    time_signature: "4/4",
    key_note: "A",
    key_mode: "major",
    camelot: "11B",
    open_key: "4d",
    loudness_db: -8.5,
    danceability: 0.81,
    energy: 0.74,
    speechiness: null,
    acousticness: null,
    instrumentalness: null,
    liveness: null,
    valence: 0.5,
    dance_floor: null,
    chill: null,
    aggressive: null,
    hype: null,
    groove: null,
    warmup: null,
    peak_time: null,
    blendability: null,
    vocal_risk: null,
    mood_label: "energetic",
    mood_vector: null,
    genres: ["house"],
    provider: "musicae",
    raw_response: null,
    analysis_status: "complete",
    last_error: null,
    analyzed_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("analysisRowToResolvedFeatures", () => {
  it("maps complete Musicae row with true flags", () => {
    const resolved = analysisRowToResolvedFeatures("abc123", baseRow());
    expect(resolved.trueBpm).toBe(true);
    expect(resolved.trueEnergy).toBe(true);
    expect(resolved.trueCamelot).toBe(true);
    expect(resolved.bpm).toBe(128.4);
    expect(resolved.bpmAlt).toBe(64.2);
    expect(resolved.camelot).toBe("11B");
    expect(resolved.mood).toBe("energetic");
  });

  it("returns defaults when row missing or not complete", () => {
    const resolved = analysisRowToResolvedFeatures(
      "abc123",
      baseRow({ analysis_status: "not_found", bpm: null })
    );
    expect(resolved.trueBpm).toBe(false);
    expect(resolved.bpm).toBe(100);
  });
});

describe("computeBpmAlt", () => {
  it("prefers half-time when different from primary BPM", () => {
    expect(computeBpmAlt(baseRow())).toBe(64.2);
  });
});

describe("analysisRowToDeckFields", () => {
  it("rounds BPM and marks complete", () => {
    expect(analysisRowToDeckFields(baseRow())).toEqual({
      bpm: 128,
      analysisStatus: "complete",
    });
  });

  it("marks unavailable for not_found", () => {
    expect(
      analysisRowToDeckFields(baseRow({ analysis_status: "not_found" }))
    ).toEqual({ analysisStatus: "unavailable" });
  });

  it("returns empty when no cache row", () => {
    expect(analysisRowToDeckFields(null)).toEqual({});
  });
});
