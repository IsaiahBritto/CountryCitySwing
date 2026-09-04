import { describe, expect, it } from "vitest";
import {
  clampCrossfadeSeconds,
  crossfadeSecondsToMs,
  djDeckReducer,
  getNextUnplayedPlaylistIndex,
  getNowPlaying,
  getUpNext,
  INITIAL_DJ_DECK_STATE,
  isPlayQueueExhausted,
  playQueueRowStatus,
  playQueueTotalDurationMs,
  playlistRowStatus,
} from "@/lib/spotify/djDeckState";

const track = (i: number) => ({
  id: `id-${i}`,
  uri: `spotify:track:id-${i}`,
  name: `Song ${i}`,
  primaryArtist: `Artist ${i}`,
  durationMs: 180000,
});

function withPlaylistOnDeck(deck: "A" | "B") {
  const playlist = [track(0), track(1), track(2), track(3)];
  let state = INITIAL_DJ_DECK_STATE;
  if (deck === "B") {
    state = djDeckReducer(state, { type: "ENABLE_SECOND_DECK" });
  }
  return djDeckReducer(state, {
    type: "SET_PLAYLIST",
    deck,
    playlist,
    playlistTotalDurationMs: 720000,
  });
}

function withPlaylist() {
  return withPlaylistOnDeck("A");
}

describe("djDeckReducer", () => {
  it("SET_PLAYLIST loads playlist without filling play queue", () => {
    const next = withPlaylist();
    expect(next.deckA.playlist).toHaveLength(4);
    expect(next.deckA.playQueue).toHaveLength(0);
    expect(next.deckA.track?.id).toBe("id-0");
    expect(next.deckA.playlistIndex).toBe(0);
  });

  it("ADD_TO_PLAY_QUEUE appends and dedupes", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    expect(state.deckA.playQueue).toHaveLength(1);
    expect(state.deckA.playQueue[0]?.id).toBe("id-2");
  });

  it("SET_PLAY_QUEUE_INDEX consumes track from queue", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(1),
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "A",
      index: 0,
    });
    expect(state.deckA.track?.id).toBe("id-1");
    expect(state.deckA.playQueue.map((t) => t.id)).toEqual(["id-2"]);
    expect(state.deckA.playQueueIndex).toBeNull();
  });

  it("MOVE_PLAY_QUEUE_ITEM reorders upcoming queue", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(1),
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "MOVE_PLAY_QUEUE_ITEM",
      deck: "A",
      fromIndex: 0,
      toIndex: 1,
    });
    expect(state.deckA.playQueue.map((t) => t.id)).toEqual(["id-2", "id-1"]);
  });

  it("ADVANCE_TRACK consumes next queue head", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(1),
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, { type: "ADVANCE_TRACK", deck: "A" });
    expect(state.deckA.track?.id).toBe("id-2");
    expect(state.deckA.playQueue).toHaveLength(0);
  });

  it("captures playlistResumeIndex when queue takes over", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "SET_PLAYLIST_INDEX",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "A",
      index: 0,
    });
    expect(state.deckA.playlistResumeIndex).toBe(1);
  });

  it("QUEUE_EXHAUSTED resets playback source but keeps resume index", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "SET_PLAYLIST_INDEX",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, { type: "QUEUE_EXHAUSTED", deck: "A" });
    expect(state.deckA.playbackSource).toBe("playlist");
    expect(state.deckA.playlistResumeIndex).toBe(1);
    expect(getUpNext(state, "A")?.id).toBe("id-1");
  });

  it("TRANSITION_TO_PLAYLIST switches to playlist at index", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "TRANSITION_TO_PLAYLIST",
      deck: "A",
      playlistIndex: 2,
    });
    expect(state.deckA.playbackSource).toBe("playlist");
    expect(state.deckA.playlistIndex).toBe(2);
    expect(state.deckA.track?.id).toBe("id-2");
    expect(state.deckA.playlistResumeIndex).toBeNull();
  });

  it("getNextUnplayedPlaylistIndex skips played indices", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "MARK_PLAYLIST_INDEX_PLAYED",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, {
      type: "MARK_PLAYLIST_INDEX_PLAYED",
      deck: "A",
      index: 1,
    });
    expect(getNextUnplayedPlaylistIndex(state, "A")).toBe(2);
  });

  it("isPlayQueueExhausted when no upcoming queue tracks", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(1),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "A",
      index: 0,
    });
    expect(isPlayQueueExhausted(state, "A")).toBe(true);
  });

  it("ADVANCE_TRACK clears playlistResumeIndex on playlist advance", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "SET_PLAYLIST_INDEX",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, { type: "QUEUE_EXHAUSTED", deck: "A" });
    state = djDeckReducer(state, { type: "ADVANCE_TRACK", deck: "A" });
    expect(state.deckA.playlistResumeIndex).toBeNull();
    expect(state.deckA.playlistIndex).toBe(1);
    expect(state.deckA.track?.id).toBe("id-1");
  });

  it("SET_DECK_CROSSFADE clamps and snaps to half-second steps", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "SET_DECK_CROSSFADE",
      deck: "A",
      seconds: 3.7,
    });
    expect(state.deckCrossfadeSeconds.A).toBe(3.5);
    state = djDeckReducer(state, {
      type: "SET_DECK_CROSSFADE",
      deck: "B",
      seconds: 11,
    });
    expect(state.deckCrossfadeSeconds.B).toBe(10);
  });
});

describe("selectors", () => {
  it("getUpNext returns queue head when playlist playing with pending queue", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    expect(state.deckA.playbackSource).toBe("playlist");
    expect(getUpNext(state, "A")?.id).toBe("id-2");
  });

  it("getUpNext returns next upcoming queue track while queue plays", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(1),
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "A",
      index: 0,
    });
    expect(state.deckA.track?.id).toBe("id-1");
    expect(getUpNext(state, "A")?.id).toBe("id-2");
  });

  it("playQueueRowStatus marks all rows upcoming", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(1),
    });
    expect(playQueueRowStatus(state, "A", 0)).toBe("upcoming");
  });

  it("playlistRowStatus marks played indices", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "SET_PLAYLIST_INDEX",
      deck: "A",
      index: 1,
    });
    expect(playlistRowStatus(state, "A", 1)).toBe("current");
    expect(playlistRowStatus(state, "A", 0)).toBe("upcoming");
    state = djDeckReducer(state, {
      type: "MARK_PLAYLIST_INDEX_PLAYED",
      deck: "A",
      index: 0,
    });
    expect(playlistRowStatus(state, "A", 0)).toBe("played");
  });

  it("playQueueTotalDurationMs sums durations", () => {
    expect(playQueueTotalDurationMs([track(0), track(1)])).toBe(360000);
  });

  it("getNowPlaying returns active deck track", () => {
    const state = withPlaylist();
    expect(getNowPlaying(state)?.id).toBe("id-0");
  });

  it("getUpNext returns song after resume track once resume is playing on deck A", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, {
      type: "SET_PLAYLIST_INDEX",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "A",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "A",
      index: 0,
    });
    state = djDeckReducer(state, { type: "QUEUE_EXHAUSTED", deck: "A" });
    state = djDeckReducer(state, { type: "ADVANCE_TRACK", deck: "A" });
    expect(state.deckA.track?.id).toBe("id-1");
    expect(getUpNext(state, "A")?.id).toBe("id-2");
  });

  it("getUpNext returns song after resume track once resume is playing on deck B", () => {
    let state = withPlaylistOnDeck("B");
    state = djDeckReducer(state, {
      type: "SET_PLAYLIST_INDEX",
      deck: "B",
      index: 0,
    });
    state = djDeckReducer(state, {
      type: "ADD_TO_PLAY_QUEUE",
      deck: "B",
      track: track(2),
    });
    state = djDeckReducer(state, {
      type: "SET_PLAY_QUEUE_INDEX",
      deck: "B",
      index: 0,
    });
    state = djDeckReducer(state, { type: "QUEUE_EXHAUSTED", deck: "B" });
    state = djDeckReducer(state, { type: "ADVANCE_TRACK", deck: "B" });
    expect(state.deckB.track?.id).toBe("id-1");
    expect(getUpNext(state, "B")?.id).toBe("id-2");
  });
});

describe("crossfade helpers", () => {
  it("clampCrossfadeSeconds snaps to half seconds within 0-10", () => {
    expect(clampCrossfadeSeconds(3.7)).toBe(3.5);
    expect(clampCrossfadeSeconds(11)).toBe(10);
    expect(clampCrossfadeSeconds(-1)).toBe(0);
  });

  it("crossfadeSecondsToMs converts clamped seconds", () => {
    expect(crossfadeSecondsToMs(2.5)).toBe(2500);
  });

  it("DISABLE_SECOND_DECK clears deck B and preserves deck A", () => {
    let state = withPlaylist();
    state = djDeckReducer(state, { type: "ENABLE_SECOND_DECK" });
    state = djDeckReducer(state, {
      type: "SET_PLAYLIST",
      deck: "B",
      playlist: [track(10), track(11)],
      playlistTotalDurationMs: 360000,
    });
    state = djDeckReducer(state, { type: "SET_ACTIVE_DECK", deck: "B" });
    state = djDeckReducer(state, {
      type: "SET_AFTER_QUEUE_CONTINUE_DECK",
      deck: "A",
      targetDeck: "B",
    });

    const next = djDeckReducer(state, { type: "DISABLE_SECOND_DECK" });

    expect(next.secondDeckEnabled).toBe(false);
    expect(next.activeDeck).toBe("A");
    expect(next.deckA.track?.id).toBe("id-0");
    expect(next.deckA.playlist).toHaveLength(4);
    expect(next.deckA.afterQueueContinueDeck).toBe("A");
    expect(next.deckB.playlist).toHaveLength(0);
    expect(next.deckB.track).toBeNull();
    expect(next.deckB.enabled).toBe(false);
    expect(next.highlightedQueueIndex.B).toBeNull();
    expect(next.highlightedPlaylistIndex.B).toBeNull();
  });
});
