import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isThreeFourTimeSignature,
  resolveMasterGenreForSocialRequest,
  resolveTimeSignatureForSocialRequest,
} from "@/lib/spotify/socialRequestMasterGenre";

vi.mock("@/lib/audioAnalysis/cache", () => ({
  loadCachedAnalysisForTracks: vi.fn(),
}));

vi.mock("@/lib/audioAnalysis/service", () => ({
  resolveAudioAnalysis: vi.fn(),
}));

vi.mock("@/lib/spotify/client", () => ({
  fetchTrackIsrc: vi.fn(),
}));

import { loadCachedAnalysisForTracks } from "@/lib/audioAnalysis/cache";
import { resolveAudioAnalysis } from "@/lib/audioAnalysis/service";

describe("isThreeFourTimeSignature", () => {
  it("matches 3/4 only", () => {
    expect(isThreeFourTimeSignature("3/4")).toBe(true);
    expect(isThreeFourTimeSignature(" 3/4 ")).toBe(true);
    expect(isThreeFourTimeSignature("4/4")).toBe(false);
    expect(isThreeFourTimeSignature(null)).toBe(false);
    expect(isThreeFourTimeSignature("")).toBe(false);
  });
});

describe("resolveMasterGenreForSocialRequest", () => {
  beforeEach(() => {
    vi.mocked(loadCachedAnalysisForTracks).mockReset();
    vi.mocked(resolveAudioAnalysis).mockReset();
  });

  it("returns wcs unchanged", async () => {
    const genre = await resolveMasterGenreForSocialRequest({
      requestGenre: "wcs",
      trackId: "t1",
      accessToken: "token",
    });
    expect(genre).toBe("wcs");
    expect(loadCachedAnalysisForTracks).not.toHaveBeenCalled();
  });

  it("returns wz for cs when time signature is 3/4", async () => {
    vi.mocked(loadCachedAnalysisForTracks).mockResolvedValue(
      new Map([
        [
          "t1",
          {
            isrc: "US123",
            analysis_status: "complete",
            time_signature: "3/4",
          } as never,
        ],
      ])
    );

    const genre = await resolveMasterGenreForSocialRequest({
      requestGenre: "cs",
      trackId: "t1",
      accessToken: "token",
    });
    expect(genre).toBe("wz");
  });

  it("returns cs for cs when time signature is 4/4", async () => {
    vi.mocked(loadCachedAnalysisForTracks).mockResolvedValue(
      new Map([
        [
          "t1",
          {
            isrc: "US123",
            analysis_status: "complete",
            time_signature: "4/4",
          } as never,
        ],
      ])
    );

    const genre = await resolveMasterGenreForSocialRequest({
      requestGenre: "cs",
      trackId: "t1",
      accessToken: "token",
    });
    expect(genre).toBe("cs");
  });
});

describe("resolveTimeSignatureForSocialRequest", () => {
  beforeEach(() => {
    vi.mocked(loadCachedAnalysisForTracks).mockReset();
    vi.mocked(resolveAudioAnalysis).mockReset();
  });

  it("returns cached time signature without Musicae", async () => {
    vi.mocked(loadCachedAnalysisForTracks).mockResolvedValue(
      new Map([
        [
          "t1",
          {
            analysis_status: "complete",
            time_signature: "6/8",
          } as never,
        ],
      ])
    );

    const ts = await resolveTimeSignatureForSocialRequest({
      trackId: "t1",
      accessToken: "token",
    });
    expect(ts).toBe("6/8");
    expect(resolveAudioAnalysis).not.toHaveBeenCalled();
  });
});
