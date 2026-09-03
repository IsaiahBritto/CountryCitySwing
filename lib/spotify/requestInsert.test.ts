import { describe, expect, it } from "vitest";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import {
  findRequestInsertTarget,
  genreSetStart,
  resolvePlaybackIndex,
  searchStartIndex,
  type SnapshotTrack,
} from "@/lib/spotify/requestInsert";

function track(
  position: number,
  genre: GenrePool,
  source: "generated" | "request" = "generated",
  id = `t${position}`
): SnapshotTrack {
  return {
    position,
    spotifyTrackId: id,
    uri: `spotify:track:${id}`,
    name: `Song ${position}`,
    primaryArtist: "Artist",
    genre,
    source,
  };
}

/** Build N full 2-2-2 cycles. */
function buildCycles(cycles: number): SnapshotTrack[] {
  const pattern: GenrePool[] = ["cs", "cs", "wcs", "wcs", "ld", "ld"];
  const tracks: SnapshotTrack[] = [];
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i < pattern.length; i++) {
      const pos = c * 6 + i;
      tracks.push(track(pos, pattern[i]));
    }
  }
  return tracks;
}

describe("genreSetStart", () => {
  it("returns set start for CS indices", () => {
    expect(genreSetStart(0, "cs")).toBe(0);
    expect(genreSetStart(1, "cs")).toBe(0);
    expect(genreSetStart(6, "cs")).toBe(6);
    expect(genreSetStart(7, "cs")).toBe(6);
  });

  it("returns null when index is not that genre", () => {
    expect(genreSetStart(2, "cs")).toBeNull();
    expect(genreSetStart(0, "wcs")).toBeNull();
  });
});

describe("searchStartIndex", () => {
  it("starts at 0 when nothing is playing", () => {
    expect(searchStartIndex(-1, "cs", 18)).toBe(0);
  });

  it("skips the rest of the current CS set when inside CS", () => {
    // index 0 (CS) -> next CS set starts at 6
    expect(searchStartIndex(0, "cs", 18)).toBe(2);
    // Wait - set start is 0, set ends after 2 songs -> search from 2.
    // But plan says: if in CS, WCS and LD should play, and CS goes to NEXT CS set.
    // So from index 0 in CS set [0,1], search should start at 6 (next CS set), not 2.
    //
    // Re-read: "search after that set ends" = after position 1, i.e. from index 2.
    // Then findRequestInsertTarget walks G sets with setStart >= from.
    // For CS, sets start at 0, 6, 12...
    // setStart 0 < from 2 → skip
    // setStart 6 >= 2 → take first generated in that set
    // So searchStartIndex returning 2 is correct!
    expect(searchStartIndex(1, "cs", 18)).toBe(2);
  });

  it("when in WCS requesting CS, searches after current track", () => {
    expect(searchStartIndex(2, "cs", 18)).toBe(3);
    // CS sets: 0 skipped (<3), 6 ok
  });
});

describe("findRequestInsertTarget", () => {
  it("replaces first CS slot when nothing playing", () => {
    const tracks = buildCycles(3);
    expect(findRequestInsertTarget(tracks, -1, "cs")).toEqual({
      kind: "replace",
      position: 0,
    });
  });

  it("during CS, replaces in the next CS set (not current)", () => {
    const tracks = buildCycles(3);
    // Playing first CS song of first set
    expect(findRequestInsertTarget(tracks, 0, "cs")).toEqual({
      kind: "replace",
      position: 6,
    });
    // Playing second CS song
    expect(findRequestInsertTarget(tracks, 1, "cs")).toEqual({
      kind: "replace",
      position: 6,
    });
  });

  it("during WCS, places CS into the following CS set", () => {
    const tracks = buildCycles(3);
    expect(findRequestInsertTarget(tracks, 2, "cs")).toEqual({
      kind: "replace",
      position: 6,
    });
  });

  it("during WCS requesting WCS, skips current WCS set", () => {
    const tracks = buildCycles(3);
    expect(findRequestInsertTarget(tracks, 2, "wcs")).toEqual({
      kind: "replace",
      position: 8,
    });
  });

  it("fills remaining slot in a partially requested set", () => {
    const tracks = buildCycles(3);
    tracks[6] = { ...tracks[6], source: "request" };
    expect(findRequestInsertTarget(tracks, 0, "cs")).toEqual({
      kind: "replace",
      position: 7,
    });
  });

  it("skips a CS set fully replaced by requests", () => {
    const tracks = buildCycles(3);
    tracks[6] = { ...tracks[6], source: "request" };
    tracks[7] = { ...tracks[7], source: "request" };
    expect(findRequestInsertTarget(tracks, 0, "cs")).toEqual({
      kind: "replace",
      position: 12,
    });
  });

  it("appends when no patterned genre slots remain", () => {
    const tracks = buildCycles(2);
    // Mark all CS slots as requests
    for (const pos of [0, 1, 6, 7]) {
      tracks[pos] = { ...tracks[pos], source: "request" };
    }
    // Playing at end of playlist patterned region
    expect(findRequestInsertTarget(tracks, 11, "cs")).toEqual({
      kind: "append",
    });
  });

  it("during first set before any CS requests mid-WCS requesting LD goes to current cycle LD", () => {
    const tracks = buildCycles(2);
    expect(findRequestInsertTarget(tracks, 2, "ld")).toEqual({
      kind: "replace",
      position: 4,
    });
  });

  it("handles variable block sizes", () => {
    const pattern: GenrePool[] = ["cs", "cs", "cs", "ld"];
    const tracks: SnapshotTrack[] = [];
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < pattern.length; i++) {
        const pos = c * pattern.length + i;
        tracks.push(track(pos, pattern[i]));
      }
    }
    expect(findRequestInsertTarget(tracks, -1, "cs", pattern)).toEqual({
      kind: "replace",
      position: 0,
    });
    expect(findRequestInsertTarget(tracks, 0, "cs", pattern)).toEqual({
      kind: "replace",
      position: 4,
    });
    expect(findRequestInsertTarget(tracks, 2, "ld", pattern)).toEqual({
      kind: "replace",
      position: 3,
    });
  });

  it("handles repeated genre blocks in one cycle", () => {
    const pattern: GenrePool[] = ["cs", "wcs", "cs", "ld"];
    const tracks: SnapshotTrack[] = pattern.map((g, i) => track(i, g));
    tracks.push(...pattern.map((g, i) => track(i + 4, g)));
    expect(findRequestInsertTarget(tracks, 1, "cs", pattern)).toEqual({
      kind: "replace",
      position: 2,
    });
  });
});

describe("resolvePlaybackIndex", () => {
  it("returns -1 when not playing", () => {
    const tracks = buildCycles(1);
    expect(resolvePlaybackIndex(tracks, null, null, "abc")).toBe(-1);
  });

  it("returns -1 when context playlist mismatches", () => {
    const tracks = buildCycles(1);
    expect(
      resolvePlaybackIndex(
        tracks,
        { trackId: "t0", trackUri: "spotify:track:t0" },
        "other",
        "abc"
      )
    ).toBe(-1);
  });

  it("matches track id", () => {
    const tracks = buildCycles(1);
    expect(
      resolvePlaybackIndex(
        tracks,
        { trackId: "t3", trackUri: null },
        "abc",
        "abc"
      )
    ).toBe(3);
  });
});
