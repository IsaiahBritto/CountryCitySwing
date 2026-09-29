import { describe, expect, it } from "vitest";
import { normalizeIsrc } from "@/lib/musicae/isrc";
import {
  analysisFromMusicaeResponse,
} from "@/lib/musicae/normalize";
import type { MusicaeAnalysisResponse } from "@/lib/musicae/types";

describe("normalizeIsrc", () => {
  it("trims and uppercases", () => {
    expect(normalizeIsrc(" usum72501234 ")).toBe("USUM72501234");
  });

  it("returns null for empty", () => {
    expect(normalizeIsrc("")).toBeNull();
    expect(normalizeIsrc(null)).toBeNull();
  });
});

describe("analysisFromMusicaeResponse", () => {
  const sample: MusicaeAnalysisResponse = {
    track: {
      ids: { spotify: "abc123", isrc: "GBDUW0000053" },
      name: "Test",
      loudness_db: -8.5,
    },
    rhythm: {
      bpm: 128.4,
      half_time_bpm: 64.2,
      double_time_bpm: 256.8,
      time_signature: "4/4",
    },
    harmony: {
      note: "A",
      mode: "major",
      camelot: "11B",
      open_key: "4d",
    },
    score: {
      danceability: 0.81,
      energy: 0.74,
      valence: 0.5,
    },
    mood: { label: "energetic", vector: { party: 0.8 } },
    genres: ["house"],
  };

  it("maps core DJ fields", () => {
    const a = analysisFromMusicaeResponse(sample, null);
    expect(a?.isrc).toBe("GBDUW0000053");
    expect(a?.bpm).toBe(128.4);
    expect(a?.halfTimeBpm).toBe(64.2);
    expect(a?.camelot).toBe("11B");
    expect(a?.energy).toBe(0.74);
    expect(a?.moodLabel).toBe("energetic");
    expect(a?.genres).toEqual(["house"]);
  });

  it("maps into resolved features via analysis row shape", () => {
    const a = analysisFromMusicaeResponse(sample, null)!;
    expect(a.bpm).toBe(128.4);
    expect(a.energy).toBe(0.74);
  });
});
