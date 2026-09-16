import { describe, expect, it } from "vitest";
import { buildDeckPlaylistPatch } from "@/lib/spotify/deckPlaylistPatchBuilder";

const sampleTrack = {
  id: "t1",
  uri: "spotify:track:t1",
  name: "Track",
  primaryArtist: "Artist",
  durationMs: 180000,
};

describe("buildDeckPlaylistPatch", () => {
  it("builds swap patch", () => {
    expect(
      buildDeckPlaylistPatch({
        result: "swapped",
        position: 29,
        swapFrom: 6,
      })
    ).toEqual({ op: "swap", from: 6, to: 29 });
  });

  it("builds replace patch", () => {
    expect(
      buildDeckPlaylistPatch({
        result: "replaced",
        position: 10,
        track: sampleTrack,
      })
    ).toEqual({ op: "replace", position: 10, track: sampleTrack });
  });

  it("builds append patch", () => {
    expect(
      buildDeckPlaylistPatch({
        result: "appended",
        position: 30,
        track: sampleTrack,
      })
    ).toEqual({ op: "append", track: sampleTrack });
  });

  it("builds batch patch for purge then replace", () => {
    expect(
      buildDeckPlaylistPatch({
        result: "replaced",
        position: 10,
        track: sampleTrack,
        purgePositions: [15, 8],
      })
    ).toEqual({
      op: "batch",
      patches: [
        { op: "remove", position: 15 },
        { op: "remove", position: 8 },
        { op: "replace", position: 10, track: sampleTrack },
      ],
    });
  });
});
