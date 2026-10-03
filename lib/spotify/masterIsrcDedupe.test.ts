import { describe, expect, it } from "vitest";
import {
  buildCanonicalTrackByIsrc,
  collectIsrcDuplicateRemovals,
} from "@/lib/spotify/masterIsrcIndex";
import type { SpotifyTrack } from "@/lib/spotify/client";

function track(
  id: string,
  isrc: string | null,
  uri = `spotify:track:${id}`
): SpotifyTrack {
  return {
    id,
    uri,
    name: `Song ${id}`,
    primaryArtist: "Artist",
    durationMs: 200000,
    isrc,
  };
}

describe("buildCanonicalTrackByIsrc", () => {
  it("keeps the earliest position per ISRC", () => {
    const map = buildCanonicalTrackByIsrc([
      { track: track("b", "USRC1"), position: 1 },
      { track: track("a", "USRC1"), position: 0 },
      { track: track("c", "USRC2"), position: 2 },
    ]);
    expect(map.get("USRC1")?.id).toBe("a");
    expect(map.get("USRC2")?.id).toBe("c");
  });

  it("ignores tracks without ISRC", () => {
    const map = buildCanonicalTrackByIsrc([
      { track: track("a", null), position: 0 },
    ]);
    expect(map.size).toBe(0);
  });
});

describe("collectIsrcDuplicateRemovals", () => {
  it("marks later duplicates for removal", () => {
    const result = collectIsrcDuplicateRemovals([
      { track: track("keep", "USRC1"), position: 0 },
      { track: track("drop", "USRC1"), position: 3 },
      { track: track("solo", "USRC2"), position: 1 },
    ]);
    expect(result.removed).toBe(1);
    expect(result.groupsWithDuplicates).toBe(1);
    expect(result.removals).toEqual([
      { uri: "spotify:track:drop", position: 3 },
    ]);
  });
});
