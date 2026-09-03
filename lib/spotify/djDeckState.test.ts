import { describe, expect, it } from "vitest";
import {
  djDeckReducer,
  getIncomingDeck,
  getNextUp,
  getNowPlaying,
  INITIAL_DJ_DECK_STATE,
  queueRowStatus,
} from "@/lib/spotify/djDeckState";

const track = (i: number) => ({
  id: `id-${i}`,
  uri: `spotify:track:id-${i}`,
  name: `Song ${i}`,
  primaryArtist: `Artist ${i}`,
  durationMs: 180000,
});

describe("djDeckReducer", () => {
  it("resets on SELECT_PLAYLIST", () => {
    const prev = {
      ...INITIAL_DJ_DECK_STATE,
      crossfader: 80,
      automixEnabled: true,
    };
    const next = djDeckReducer(prev, {
      type: "SELECT_PLAYLIST",
      playlistId: "abc",
      playlistName: "Test",
    });
    expect(next.selectedPlaylistId).toBe("abc");
    expect(next.crossfader).toBe(0);
    expect(next.automixEnabled).toBe(false);
  });

  it("SET_QUEUE loads first two tracks onto decks", () => {
    const queue = [track(0), track(1), track(2)];
    const next = djDeckReducer(INITIAL_DJ_DECK_STATE, {
      type: "SET_QUEUE",
      queue,
      totalDurationMs: 540000,
    });
    expect(next.deckA.track?.id).toBe("id-0");
    expect(next.deckB.track?.id).toBe("id-1");
    expect(next.totalDurationMs).toBe(540000);
  });

  it("LOAD_TO_DECK updates inactive deck", () => {
    const withQueue = djDeckReducer(INITIAL_DJ_DECK_STATE, {
      type: "SET_QUEUE",
      queue: [track(0), track(1)],
      totalDurationMs: 360000,
    });
    const next = djDeckReducer(withQueue, {
      type: "LOAD_TO_DECK",
      deck: "B",
      track: track(5),
      queueIndex: 5,
    });
    expect(next.deckB.track?.id).toBe("id-5");
  });

  it("ADVANCE_AFTER_TRANSITION swaps active deck and preloads queue", () => {
    const queue = [track(0), track(1), track(2), track(3)];
    let state = djDeckReducer(INITIAL_DJ_DECK_STATE, {
      type: "SET_QUEUE",
      queue,
      totalDurationMs: 720000,
    });
    state = djDeckReducer(state, { type: "ADVANCE_AFTER_TRANSITION" });
    expect(state.activeDeck).toBe("B");
    expect(state.crossfader).toBe(100);
    expect(state.deckA.track?.id).toBe("id-2");
  });
});

describe("selectors", () => {
  it("getNowPlaying returns active deck track", () => {
    const queue = [track(0), track(1)];
    const state = djDeckReducer(INITIAL_DJ_DECK_STATE, {
      type: "SET_QUEUE",
      queue,
      totalDurationMs: 360000,
    });
    expect(getNowPlaying(state)?.id).toBe("id-0");
  });

  it("getNextUp prefers incoming deck track", () => {
    const queue = [track(0), track(1)];
    const state = djDeckReducer(INITIAL_DJ_DECK_STATE, {
      type: "SET_QUEUE",
      queue,
      totalDurationMs: 360000,
    });
    expect(getNextUp(state)?.id).toBe("id-1");
  });

  it("getIncomingDeck toggles", () => {
    expect(getIncomingDeck("A")).toBe("B");
    expect(getIncomingDeck("B")).toBe("A");
  });

  it("queueRowStatus marks current and next", () => {
    const queue = [track(0), track(1), track(2)];
    const state = djDeckReducer(INITIAL_DJ_DECK_STATE, {
      type: "SET_QUEUE",
      queue,
      totalDurationMs: 540000,
    });
    expect(queueRowStatus(state, 0)).toBe("current");
    expect(queueRowStatus(state, 1)).toBe("next");
    expect(queueRowStatus(state, 2)).toBe("upcoming");
  });
});
