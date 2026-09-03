import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCIAL_STRUCTURE,
  expandStructure,
  genreBlockLength,
  genreBlockStart,
  genreBlockStartsInCycle,
  parsePlaylistStructure,
  structureAvailableGenres,
  validatePlaylistStructure,
} from "@/lib/spotify/playlistStructure";

describe("expandStructure", () => {
  it("expands default social structure", () => {
    expect(expandStructure(DEFAULT_SOCIAL_STRUCTURE)).toEqual([
      "cs",
      "cs",
      "wcs",
      "wcs",
      "ld",
      "ld",
    ]);
  });

  it("expands custom segments", () => {
    expect(
      expandStructure({
        segments: [
          { genre: "cs", count: 3 },
          { genre: "ld", count: 1 },
        ],
      })
    ).toEqual(["cs", "cs", "cs", "ld"]);
  });
});

describe("parsePlaylistStructure", () => {
  it("parses valid structure", () => {
    expect(
      parsePlaylistStructure({
        segments: [{ genre: "ts", count: 2 }],
      })
    ).toEqual({ segments: [{ genre: "ts", count: 2 }] });
  });

  it("rejects invalid count", () => {
    expect(parsePlaylistStructure({ segments: [{ genre: "cs", count: 0 }] })).toBeNull();
  });
});

describe("structureAvailableGenres", () => {
  it("returns unique genres in order of first appearance", () => {
    expect(
      structureAvailableGenres({
        segments: [
          { genre: "cs", count: 2 },
          { genre: "wcs", count: 1 },
          { genre: "cs", count: 1 },
        ],
      })
    ).toEqual(["cs", "wcs"]);
  });
});

describe("genreBlockStart", () => {
  const pattern = ["cs", "cs", "wcs", "wcs", "ld", "ld"];

  it("finds block start for cs at index 1", () => {
    expect(genreBlockStart(1, "cs", pattern)).toBe(0);
  });

  it("returns null when index is different genre", () => {
    expect(genreBlockStart(2, "cs", pattern)).toBeNull();
  });
});

describe("genreBlockLength", () => {
  it("counts contiguous same-genre slots", () => {
    const pattern = ["cs", "cs", "wcs", "ld", "ld", "ld"];
    expect(genreBlockLength(3, pattern)).toBe(3);
  });
});

describe("genreBlockStartsInCycle", () => {
  it("finds multiple cs blocks in one cycle", () => {
    const pattern = ["cs", "wcs", "cs", "ld"];
    expect(genreBlockStartsInCycle("cs", pattern)).toEqual([0, 2]);
  });
});

describe("validatePlaylistStructure", () => {
  it("accepts valid structure", () => {
    expect(
      validatePlaylistStructure({
        segments: [{ genre: "ts", count: 1 }],
      })
    ).toEqual({ segments: [{ genre: "ts", count: 1 }] });
  });
});
