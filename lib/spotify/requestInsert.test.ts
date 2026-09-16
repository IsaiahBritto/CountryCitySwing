import { describe, expect, it } from "vitest";
import {
  djDeckReducer,
  getNowPlaying,
  INITIAL_DJ_DECK_STATE,
} from "@/lib/spotify/djDeckState";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import {
  findRequestInsertTarget,
  genreSetStart,
  resolveExistingTrackAction,
  resolveInsertPlayheadIndex,
  resolvePlaybackIndex,
  searchStartIndex,
  type SnapshotTrack,
} from "@/lib/spotify/requestInsert";
import {
  createEmptyLivePlaylistView,
  type LivePlaylistView,
} from "@/lib/spotify/requestLiveView";

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

function mockSocialDeckView(input: {
  playlistIds: string[];
  playlistIndex: number;
  extraPlayedIndices?: number[];
}): LivePlaylistView {
  const playlist = input.playlistIds.map((id, i) => ({
    id,
    uri: `spotify:track:${id}`,
    name: `Song ${i}`,
    primaryArtist: "Artist",
    durationMs: 180000,
  }));
  let state = djDeckReducer(INITIAL_DJ_DECK_STATE, {
    type: "SELECT_PLAYLIST",
    deck: "A",
    playlistId: "social-pl",
    playlistName: "Social",
  });
  state = djDeckReducer(state, {
    type: "SET_PLAYLIST",
    deck: "A",
    playlist,
    playlistTotalDurationMs: playlist.length * 180000,
  });
  state = djDeckReducer(state, {
    type: "SET_PLAYLIST_INDEX",
    deck: "A",
    index: input.playlistIndex,
  });
  for (const idx of input.extraPlayedIndices ?? []) {
    state = djDeckReducer(state, {
      type: "MARK_PLAYLIST_INDEX_PLAYED",
      deck: "A",
      index: idx,
    });
  }
  return {
    deckAuthority: "social_deck",
    currentTrackId: getNowPlaying(state)?.id ?? null,
    activeDeck: "A",
    deckState: state,
  };
}

describe("resolveInsertPlayheadIndex", () => {
  it("uses deck now-playing track mapped into snapshot", () => {
    const tracks = buildCycles(4);
    const liveView = mockSocialDeckView({
      playlistIds: tracks.map((t) => t.spotifyTrackId),
      playlistIndex: 20,
    });
    expect(resolveInsertPlayheadIndex(tracks, liveView, -1)).toBe(20);
  });

  it("falls back to Spotify playhead when deck has no authority", () => {
    const tracks = buildCycles(3);
    expect(
      resolveInsertPlayheadIndex(tracks, createEmptyLivePlaylistView(), 12)
    ).toBe(12);
  });
});

describe("resolveExistingTrackAction", () => {
  it("returns not_in_live_playlist for ghost snapshot rows absent from deck", () => {
    const tracks = buildCycles(3);
    const liveView = mockSocialDeckView({
      playlistIds: tracks.slice(0, 6).map((t) => t.spotifyTrackId),
      playlistIndex: 0,
    });
    expect(
      resolveExistingTrackAction(tracks, "t12", 2, "cs", liveView)
    ).toEqual({
      kind: "not_in_live_playlist",
    });
  });

  it("treats the deck current track as now playing", () => {
    const tracks = buildCycles(3);
    const liveView = mockSocialDeckView({
      playlistIds: tracks.map((t) => t.spotifyTrackId),
      playlistIndex: 0,
    });
    expect(
      resolveExistingTrackAction(tracks, "t0", 0, "cs", liveView)
    ).toEqual({
      kind: "now_playing",
    });
  });

  it("does not treat skipped-ahead tracks as already played", () => {
    const tracks = buildCycles(4);
    const liveView = mockSocialDeckView({
      playlistIds: tracks.map((t) => t.spotifyTrackId),
      playlistIndex: 20,
    });
    expect(
      resolveExistingTrackAction(tracks, "t5", 20, "cs", liveView)
    ).not.toEqual({ kind: "already_played" });
  });

  it("treats deck played indices as already played", () => {
    const tracks = buildCycles(4);
    const liveView = mockSocialDeckView({
      playlistIds: tracks.map((t) => t.spotifyTrackId),
      playlistIndex: 20,
      extraPlayedIndices: [5],
    });
    expect(
      resolveExistingTrackAction(tracks, "t5", 20, "cs", liveView)
    ).toEqual({
      kind: "already_played",
    });
  });

  it("swaps a later CS track into the next generated slot", () => {
    const tracks = buildCycles(3);
    const liveView = mockSocialDeckView({
      playlistIds: tracks.map((t) => t.spotifyTrackId),
      playlistIndex: 0,
    });
    expect(
      resolveExistingTrackAction(tracks, "t12", 0, "cs", liveView)
    ).toEqual({
      kind: "swap",
      from: 12,
      to: 6,
    });
  });

  it("does not move a track that is already at or before the next slot", () => {
    const tracks = buildCycles(3);
    const liveView = mockSocialDeckView({
      playlistIds: tracks.map((t) => t.spotifyTrackId),
      playlistIndex: 0,
    });
    expect(
      resolveExistingTrackAction(tracks, "t6", 0, "cs", liveView)
    ).toEqual({
      kind: "already_queued",
    });
  });

  it("reports already queued when only append remains", () => {
    const tracks = buildCycles(3);
    for (const pos of [0, 1, 6, 7, 12, 13]) {
      tracks[pos] = { ...tracks[pos], source: "request" };
    }
    const liveView = mockSocialDeckView({
      playlistIds: tracks.map((t) => t.spotifyTrackId),
      playlistIndex: 0,
    });
    expect(
      resolveExistingTrackAction(tracks, "t12", 0, "cs", liveView)
    ).toEqual({
      kind: "already_queued",
    });
  });

  it("fallback mode never uses position-based already played", () => {
    const tracks = buildCycles(3);
    const liveView = createEmptyLivePlaylistView();
    expect(
      resolveExistingTrackAction(tracks, "t0", 20, "cs", liveView)
    ).not.toEqual({ kind: "already_played" });
  });

  it("fallback mode treats Spotify now-playing as current", () => {
    const tracks = buildCycles(3);
    const liveView = createEmptyLivePlaylistView();
    expect(
      resolveExistingTrackAction(
        tracks,
        "t3",
        3,
        "wcs",
        liveView,
        undefined,
        "t3"
      )
    ).toEqual({
      kind: "now_playing",
    });
  });

  it("fallback mode still swaps a later track forward", () => {
    const tracks = buildCycles(3);
    const liveView = createEmptyLivePlaylistView();
    expect(
      resolveExistingTrackAction(tracks, "t12", -1, "cs", liveView)
    ).toEqual({
      kind: "swap",
      from: 12,
      to: 0,
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
