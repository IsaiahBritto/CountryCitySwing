import { describe, expect, it } from "vitest";
import { buildEndOfSessionPlaylistOrder } from "@/lib/appleMusic/buildEndOfSessionPlaylistOrder";
import {
  INITIAL_DJ_DECK_STATE,
  type DeckTrack,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";

const SOCIAL_ID = "social-pl-1";

function track(id: string): DeckTrack {
  return {
    id,
    uri: `appleMusic:songs:${id}`,
    name: id,
    primaryArtist: "Artist",
    durationMs: 180_000,
    isrc: null,
  };
}

function deckWithSocial(input: {
  playedIndices: number[];
  playlistIndex?: number | null;
  currentTrack?: DeckTrack | null;
  playlist?: DeckTrack[];
  onDeck?: "A" | "B";
}): DjDeckState {
  const playlist = input.playlist ?? [
    track("a"),
    track("b"),
    track("c"),
    track("d"),
  ];
  const onDeck = input.onDeck ?? "A";
  const deckSlice = {
    playlistId: SOCIAL_ID,
    playlistName: "Tonight",
    playlist,
    playedPlaylistIndices: input.playedIndices,
    playlistIndex: input.playlistIndex ?? null,
    track: input.currentTrack ?? null,
  };

  if (onDeck === "A") {
    return {
      ...INITIAL_DJ_DECK_STATE,
      deckA: {
        ...INITIAL_DJ_DECK_STATE.deckA,
        ...deckSlice,
      },
    };
  }
  return {
    ...INITIAL_DJ_DECK_STATE,
    deckB: {
      ...INITIAL_DJ_DECK_STATE.deckB,
      enabled: true,
      ...deckSlice,
    },
  };
}

describe("buildEndOfSessionPlaylistOrder", () => {
  it("returns empty when no deck matches social playlist id", () => {
    const state = deckWithSocial({ playedIndices: [0, 1] });
    state.deckA.playlistId = "other";
    expect(buildEndOfSessionPlaylistOrder(state, SOCIAL_ID)).toEqual([]);
  });

  it("returns played tracks in ascending playlist index order", () => {
    const state = deckWithSocial({ playedIndices: [2, 0, 1] });
    expect(buildEndOfSessionPlaylistOrder(state, SOCIAL_ID)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("appends current playlist index when mid-song at end", () => {
    const state = deckWithSocial({
      playedIndices: [0],
      playlistIndex: 2,
      currentTrack: track("c"),
    });
    expect(buildEndOfSessionPlaylistOrder(state, SOCIAL_ID)).toEqual([
      "a",
      "c",
    ]);
  });

  it("does not duplicate current index if already marked played", () => {
    const state = deckWithSocial({
      playedIndices: [0, 2],
      playlistIndex: 2,
      currentTrack: track("c"),
    });
    expect(buildEndOfSessionPlaylistOrder(state, SOCIAL_ID)).toEqual([
      "a",
      "c",
    ]);
  });

  it("resolves social deck on deck B", () => {
    const state = deckWithSocial({
      playedIndices: [1],
      onDeck: "B",
    });
    expect(buildEndOfSessionPlaylistOrder(state, SOCIAL_ID)).toEqual(["b"]);
  });

  it("dedupes duplicate catalog ids from overlapping indices", () => {
    const playlist = [track("same"), track("same"), track("c")];
    const state = deckWithSocial({
      playlist,
      playedIndices: [0, 1],
    });
    expect(buildEndOfSessionPlaylistOrder(state, SOCIAL_ID)).toEqual(["same"]);
  });
});
