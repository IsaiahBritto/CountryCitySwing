import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMusicaeAnalysisBatch } from "@/lib/musicae/client";

describe("fetchMusicaeAnalysisBatch HTTP routing", () => {
  const originalKey = process.env.MUSICAE_RAPIDAPI_KEY;

  beforeEach(() => {
    process.env.MUSICAE_RAPIDAPI_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) {
      delete process.env.MUSICAE_RAPIDAPI_KEY;
    } else {
      process.env.MUSICAE_RAPIDAPI_KEY = originalKey;
    }
  });

  it("uses single-id path for one ISRC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        track: { ids: { isrc: "USUM123" } },
        rhythm: { bpm: 120 },
      }),
      text: async () => "",
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchMusicaeAnalysisBatch(["USUM123"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/v2/audio-analysis/USUM123");
    expect(url).not.toContain("?ids=");
  });

  it("uses batch ?ids= for two ISRCs in one HTTP call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        audio_analyses: [
          {
            track: { ids: { isrc: "ISRC1" } },
            rhythm: { bpm: 120 },
          },
          {
            track: { ids: { isrc: "ISRC2" } },
            rhythm: { bpm: 130 },
          },
        ],
        unavailable: [],
      }),
      text: async () => "",
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchMock);

    const map = await fetchMusicaeAnalysisBatch(["ISRC1", "ISRC2"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/v2/audio-analysis?");
    expect(url).toContain("ids=ISRC1%2CISRC2");
    expect(map.get("ISRC1")?.ok).toBe(true);
    expect(map.get("ISRC2")?.ok).toBe(true);
  });
});
