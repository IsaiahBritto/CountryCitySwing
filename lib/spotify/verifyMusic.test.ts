import { describe, expect, it } from "vitest";
import {
  collectRemovalEntries,
  partitionVerifySaveItems,
  urisToAdd,
  type VerifyMusicSaveItem,
} from "@/lib/spotify/verifyMusicLogic";

describe("partitionVerifySaveItems", () => {
  it("splits two step and waltz and tracks reclassified ids", () => {
    const items: VerifyMusicSaveItem[] = [
      { trackId: "a", uri: "uri:a", dance: "country_swing" },
      { trackId: "b", uri: "uri:b", dance: "two_step" },
      { trackId: "c", uri: "uri:c", dance: "waltz" },
      { trackId: "d", uri: "uri:d", dance: "two_step" },
    ];
    const { twoStep, waltz, reclassifiedTrackIds } =
      partitionVerifySaveItems(items);
    expect(twoStep.map((i) => i.trackId)).toEqual(["b", "d"]);
    expect(waltz.map((i) => i.trackId)).toEqual(["c"]);
    expect([...reclassifiedTrackIds].sort()).toEqual(["b", "c", "d"]);
  });
});

describe("urisToAdd", () => {
  it("skips uris already on destination", () => {
    const existing = new Set(["spotify:track:1", "spotify:track:2"]);
    expect(
      urisToAdd(
        ["spotify:track:2", "spotify:track:3", "spotify:track:3"],
        existing
      )
    ).toEqual(["spotify:track:3"]);
  });
});

describe("collectRemovalEntries", () => {
  it("returns all positions for reclassified track ids including duplicates", () => {
    const items = [
      {
        track: {
          id: "keep",
          uri: "uri:keep",
          name: "K",
          durationMs: 1,
          primaryArtist: "A",
          isrc: null,
        },
        position: 0,
      },
      {
        track: {
          id: "move",
          uri: "uri:move",
          name: "M",
          durationMs: 1,
          primaryArtist: "A",
          isrc: null,
        },
        position: 1,
      },
      {
        track: {
          id: "move",
          uri: "uri:move",
          name: "M",
          durationMs: 1,
          primaryArtist: "A",
          isrc: null,
        },
        position: 5,
      },
    ];
    const entries = collectRemovalEntries(items, new Set(["move"]));
    expect(entries).toEqual([
      { uri: "uri:move", position: 1 },
      { uri: "uri:move", position: 5 },
    ]);
  });
});
