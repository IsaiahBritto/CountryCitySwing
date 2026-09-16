import { describe, expect, it } from "vitest";
import {
  applyDeckPlaylistPatch,
  mergePlaylistPreservingPlayback,
  remapIndexAfterSwap,
  remapPlayedIndicesAfterSwap,
} from "@/lib/spotify/deckPlaylistSync";
import {
  djDeckReducer,
  INITIAL_DJ_DECK_STATE,
  type DeckState,
  type DeckTrack,
} from "@/lib/spotify/djDeckState";

const track = (i: number, durationMs = 180000): DeckTrack => ({
  id: `id-${i}`,
  uri: `spotify:track:id-${i}`,
  name: `Song ${i}`,
  primaryArtist: `Artist ${i}`,
  durationMs,
});

function deckWithPlaylist(
  playlist: DeckTrack[],
  overrides: Partial<DeckState> = {}
): DeckState {
  return {
    enabled: true,
    playlistId: "social-pl",
    playlistName: "Social",
    playlist,
    playlistTotalDurationMs: playlist.reduce((s, t) => s + t.durationMs, 0),
    playQueue: [],
    playQueueIndex: null,
    playlistIndex: 0,
    playlistResumeIndex: null,
    playbackSource: "playlist",
    afterQueueBehavior: "continue",
    afterQueueContinueDeck: "A",
    playedPlaylistIndices: [],
    track: playlist[0] ?? null,
    savedPositionMs: 0,
    skippedAfterCurrent: 0,
    shuffleEnabled: false,
    originalPlaylist: null,
    ...overrides,
  };
}

function withLongPlaylist() {
  const playlist = Array.from({ length: 30 }, (_, i) => track(i));
  let state = djDeckReducer(INITIAL_DJ_DECK_STATE, {
    type: "SET_PLAYLIST",
    deck: "A",
    playlist,
    playlistTotalDurationMs: playlist.length * 180000,
  });
  state = djDeckReducer(state, {
    type: "SET_PLAYLIST_INDEX",
    deck: "A",
    index: 28,
  });
  return state;
}

describe("remapIndexAfterSwap", () => {
  it("swaps from and to indices", () => {
    expect(remapIndexAfterSwap(6, 6, 29)).toBe(29);
    expect(remapIndexAfterSwap(29, 6, 29)).toBe(6);
    expect(remapIndexAfterSwap(28, 6, 29)).toBe(28);
  });
});

describe("applyDeckPlaylistPatch", () => {
  it("replaces at future index without moving playhead", () => {
    const playlist = Array.from({ length: 30 }, (_, i) => track(i));
    const deck = deckWithPlaylist(playlist, {
      playlistIndex: 28,
      track: playlist[28]!,
      savedPositionMs: 45000,
    });
    const replacement = track(99);

    const next = applyDeckPlaylistPatch(deck, {
      op: "replace",
      position: 6,
      track: replacement,
    });

    expect(next.playlist[6]).toEqual(replacement);
    expect(next.playlistIndex).toBe(28);
    expect(next.track?.id).toBe("id-28");
    expect(next.savedPositionMs).toBe(45000);
  });

  it("swaps positions and remaps played indices", () => {
    const playlist = Array.from({ length: 30 }, (_, i) => track(i));
    const deck = deckWithPlaylist(playlist, {
      playlistIndex: 28,
      track: playlist[28]!,
      playedPlaylistIndices: [6, 28],
    });

    const next = applyDeckPlaylistPatch(deck, {
      op: "swap",
      from: 6,
      to: 29,
    });

    expect(next.playlist[6]?.id).toBe("id-29");
    expect(next.playlist[29]?.id).toBe("id-6");
    expect(next.playlistIndex).toBe(28);
    expect(next.playedPlaylistIndices).toEqual([28, 29]);
  });

  it("appends without moving playhead", () => {
    const playlist = [track(0), track(1)];
    const deck = deckWithPlaylist(playlist, { playlistIndex: 1, track: playlist[1]! });

    const appended = track(2);
    const next = applyDeckPlaylistPatch(deck, { op: "append", track: appended });

    expect(next.playlist).toHaveLength(3);
    expect(next.playlist[2]).toEqual(appended);
    expect(next.playlistIndex).toBe(1);
  });

  it("removes ghost row and remaps indices", () => {
    const playlist = [track(0), track(1), track(2)];
    const deck = deckWithPlaylist(playlist, {
      playlistIndex: 2,
      track: playlist[2]!,
      playedPlaylistIndices: [0, 2],
    });

    const next = applyDeckPlaylistPatch(deck, { op: "remove", position: 1 });

    expect(next.playlist.map((t) => t.id)).toEqual(["id-0", "id-2"]);
    expect(next.playlistIndex).toBe(1);
    expect(next.playedPlaylistIndices).toEqual([0, 1]);
  });

  it("applies batch patches atomically", () => {
    const playlist = [track(0), track(1), track(2)];
    const deck = deckWithPlaylist(playlist, { playlistIndex: 2, track: playlist[2]! });

    const next = applyDeckPlaylistPatch(deck, {
      op: "batch",
      patches: [
        { op: "remove", position: 1 },
        { op: "replace", position: 0, track: track(99) },
      ],
    });

    expect(next.playlist).toHaveLength(2);
    expect(next.playlist[0]?.id).toBe("id-99");
    expect(next.playlist[1]?.id).toBe("id-2");
  });
});

describe("mergePlaylistPreservingPlayback", () => {
  it("preserves now-playing track by id", () => {
    const playlist = Array.from({ length: 10 }, (_, i) => track(i));
    const deck = deckWithPlaylist(playlist, {
      playlistIndex: 5,
      track: playlist[5]!,
      savedPositionMs: 90000,
      playedPlaylistIndices: [0, 1, 2],
    });

    const incoming = [
      track(0),
      track(1),
      track(2),
      track(100),
      track(5),
      track(6),
    ];
    const next = mergePlaylistPreservingPlayback(deck, incoming, 6 * 180000);

    expect(next.playlistIndex).toBe(4);
    expect(next.track?.id).toBe("id-5");
    expect(next.savedPositionMs).toBe(90000);
    expect(next.playedPlaylistIndices).toEqual([0, 1, 2]);
  });

  it("clears track when now-playing missing from incoming", () => {
    const playlist = [track(0), track(1)];
    const deck = deckWithPlaylist(playlist, {
      playlistIndex: 1,
      track: playlist[1]!,
    });

    const incoming = [track(0), track(2)];
    const next = mergePlaylistPreservingPlayback(deck, incoming, 360000);

    expect(next.track).toBeNull();
    expect(next.playlistIndex).toBeNull();
  });
});

describe("djDeckReducer APPLY_PLAYLIST_PATCH and MERGE_PLAYLIST", () => {
  it("reducer applies swap via ADVANCE next index", () => {
    const state = withLongPlaylist();
    const afterSwap = djDeckReducer(state, {
      type: "APPLY_PLAYLIST_PATCH",
      deck: "A",
      patch: { op: "swap", from: 6, to: 29 },
    });

    const deck = afterSwap.deckA;
    expect(deck.playlist[29]?.id).toBe("id-6");
    const nextTrack = deck.playlist[(deck.playlistIndex ?? 0) + 1];
    expect(nextTrack?.id).toBe("id-6");
  });

  it("reducer MERGE_PLAYLIST preserves playhead", () => {
    const state = withLongPlaylist();
    const incoming = state.deckA.playlist.map((t, i) =>
      i === 10 ? track(500) : t
    );
    const merged = djDeckReducer(state, {
      type: "MERGE_PLAYLIST",
      deck: "A",
      playlist: incoming,
      playlistTotalDurationMs: incoming.length * 180000,
    });

    expect(merged.deckA.playlistIndex).toBe(28);
    expect(merged.deckA.track?.id).toBe("id-28");
    expect(merged.deckA.playlist[10]?.id).toBe("id-500");
  });
});

describe("remapPlayedIndicesAfterSwap", () => {
  it("remaps played slot indices", () => {
    expect(remapPlayedIndicesAfterSwap([6, 28, 29], 6, 29)).toEqual([6, 28, 29]);
  });
});
