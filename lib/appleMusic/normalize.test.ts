import { describe, expect, it } from "vitest";
import {
  deckTrackFromAppleSongResource,
  normalizeAppleSongResource,
} from "@/lib/appleMusic/normalize";

describe("normalizeAppleSongResource", () => {
  it("maps catalog song attributes", () => {
    const track = normalizeAppleSongResource({
      id: "123",
      attributes: {
        name: "Test Song",
        artistName: "Artist",
        durationInMillis: 200000,
        isrc: "usrc12345678",
      },
    });
    expect(track?.catalogId).toBe("123");
    expect(track?.isrc).toBe("USRC12345678");
  });

  it("builds deck tracks with apple uri", () => {
    const deck = deckTrackFromAppleSongResource({
      id: "999",
      attributes: {
        name: "A",
        artistName: "B",
        durationInMillis: 1000,
      },
    });
    expect(deck?.uri).toBe("appleMusic:songs:999");
  });
});
