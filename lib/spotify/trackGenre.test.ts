import { describe, expect, it } from "vitest";
import {
  genreForActivationPosition,
  genreFromPatternPosition,
  resolveTrackGenre,
} from "@/lib/spotify/trackGenre";

const pattern314 = ["cs", "cs", "cs", "wcs", "ld", "ld", "ld", "ld"] as const;

describe("genreFromPatternPosition", () => {
  it("returns genre from custom pattern by position", () => {
    expect(genreFromPatternPosition(0, [...pattern314])).toBe("cs");
    expect(genreFromPatternPosition(3, [...pattern314])).toBe("wcs");
    expect(genreFromPatternPosition(4, [...pattern314])).toBe("ld");
    expect(genreFromPatternPosition(8, [...pattern314])).toBe("cs");
  });

  it("returns null for empty pattern", () => {
    expect(genreFromPatternPosition(0, [])).toBeNull();
  });
});

describe("resolveTrackGenre", () => {
  const snapshotByTrackId = new Map<string, "cs" | "wcs" | "ld">([
    ["requested", "cs"],
  ]);
  const snapshotByPosition = new Map<number, "cs" | "wcs" | "ld">([
    [2, "ld"],
  ]);

  it("prefers snapshot by track id", () => {
    expect(
      resolveTrackGenre({
        trackId: "requested",
        playlistIndex: 5,
        pattern: [...pattern314],
        snapshotByTrackId,
        allowPositionFallback: true,
      })
    ).toBe("cs");
  });

  it("uses snapshot by position when track id missing", () => {
    expect(
      resolveTrackGenre({
        trackId: "unknown",
        playlistIndex: 2,
        pattern: [...pattern314],
        snapshotByTrackId,
        snapshotByPosition,
        allowPositionFallback: true,
      })
    ).toBe("ld");
  });

  it("falls back to pattern position when allowed", () => {
    expect(
      resolveTrackGenre({
        trackId: "unknown",
        playlistIndex: 3,
        pattern: [...pattern314],
        snapshotByTrackId,
        allowPositionFallback: true,
      })
    ).toBe("wcs");
  });

  it("returns null when position fallback disabled", () => {
    expect(
      resolveTrackGenre({
        trackId: "unknown",
        playlistIndex: 3,
        pattern: [...pattern314],
        snapshotByTrackId,
        allowPositionFallback: false,
      })
    ).toBeNull();
  });
});

describe("genreForActivationPosition", () => {
  it("prefers master map over pattern", () => {
    const master = new Map([["t1", "wcs" as const]]);
    expect(
      genreForActivationPosition(0, "t1", master, ["cs", "cs", "ld"])
    ).toBe("wcs");
  });

  it("uses pattern when master has no entry", () => {
    expect(
      genreForActivationPosition(1, "t2", new Map(), ["cs", "wcs", "ld"])
    ).toBe("wcs");
  });
});
