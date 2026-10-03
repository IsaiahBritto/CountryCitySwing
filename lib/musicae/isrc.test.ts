import { describe, expect, it } from "vitest";
import { normalizeIsrc, spotifyCacheIsrc } from "@/lib/musicae/isrc";

describe("isrc helpers", () => {
  it("normalizes ISRC", () => {
    expect(normalizeIsrc(" usum72501234 ")).toBe("USUM72501234");
  });

  it("builds synthetic Spotify cache keys", () => {
    expect(spotifyCacheIsrc("abc")).toBe("SPOTIFY:abc");
  });
});
