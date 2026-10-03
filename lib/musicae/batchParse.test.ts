import { describe, expect, it } from "vitest";
import {
  extractBatchAnalysisEntries,
  parseMusicaeAudioAnalysisBatch,
} from "@/lib/musicae/batchParse";
import type { MusicaeAnalysisResponse } from "@/lib/musicae/types";

const sampleAnalysis: MusicaeAnalysisResponse = {
  track: { ids: { isrc: "GBDUW0000053" } },
  rhythm: { bpm: 128 },
  harmony: { camelot: "11B" },
};

describe("extractBatchAnalysisEntries", () => {
  it("reads audio_analysis key (Musicae batch)", () => {
    expect(
      extractBatchAnalysisEntries({
        audio_analysis: [sampleAnalysis, null],
        partial: false,
        unavailable: [],
      })
    ).toEqual([sampleAnalysis, null]);
  });

  it("reads audio_analyses key", () => {
    expect(
      extractBatchAnalysisEntries({
        audio_analyses: [sampleAnalysis, null],
      })
    ).toEqual([sampleAnalysis, null]);
  });

  it("reads raw array", () => {
    expect(extractBatchAnalysisEntries([sampleAnalysis])).toEqual([
      sampleAnalysis,
    ]);
  });
});

describe("parseMusicaeAudioAnalysisBatch", () => {
  const ids = ["ISRC1", "ISRC2"];

  it("maps 404 on whole response to not_found for all ids", () => {
    const out = parseMusicaeAudioAnalysisBatch(ids, null, 404);
    expect(out).toHaveLength(2);
    expect(out.every((r) => !r.ok && r.notFound)).toBe(true);
  });

  it("maps 429 to temporary errors for all ids", () => {
    const out = parseMusicaeAudioAnalysisBatch(
      ids,
      null,
      429,
      "daily quota"
    );
    expect(out[0].ok).toBe(false);
    if (!out[0].ok) {
      expect(out[0].status).toBe(429);
      expect(out[0].notFound).toBe(false);
    }
  });

  it("maps positional success and null not in unavailable to not_found", () => {
    const out = parseMusicaeAudioAnalysisBatch(
      ids,
      { audio_analyses: [sampleAnalysis, null], unavailable: [] },
      200
    );
    expect(out[0].ok).toBe(true);
    expect(out[1].ok).toBe(false);
    if (!out[1].ok) {
      expect(out[1].notFound).toBe(true);
    }
  });

  it("maps null in unavailable to retryable error", () => {
    const out = parseMusicaeAudioAnalysisBatch(
      ids,
      {
        audio_analyses: [sampleAnalysis, null],
        unavailable: ["ISRC2"],
      },
      200
    );
    expect(out[1].ok).toBe(false);
    if (!out[1].ok) {
      expect(out[1].notFound).toBe(false);
      expect(out[1].status).toBe(503);
    }
  });

  it("unwraps nested audio_analysis on each entry", () => {
    const out = parseMusicaeAudioAnalysisBatch(
      ["ISRC1"],
      {
        audio_analysis: [{ audio_analysis: sampleAnalysis }],
        unavailable: [],
      },
      200
    );
    expect(out[0]?.ok).toBe(true);
  });
});
