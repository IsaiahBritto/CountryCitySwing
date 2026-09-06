import { describe, expect, it } from "vitest";
import {
  isDebouncedRemoteDeckAction,
  isRemoteDeckAction,
  parseRemoteDeckAction,
} from "@/lib/spotify/djDeckActionWire";

const sampleTrack = {
  id: "track-1",
  uri: "spotify:track:abc",
  name: "Test Song",
  primaryArtist: "Artist",
  durationMs: 180000,
};

describe("parseRemoteDeckAction", () => {
  it("accepts volume and fade actions", () => {
    expect(
      parseRemoteDeckAction({ type: "SET_MASTER_VOLUME", value: 0.5 })
    ).toEqual({ type: "SET_MASTER_VOLUME", value: 0.5 });
    expect(
      parseRemoteDeckAction({ type: "SET_DECK_VOLUME", deck: "A", value: 0.8 })
    ).toEqual({ type: "SET_DECK_VOLUME", deck: "A", value: 0.8 });
    expect(
      parseRemoteDeckAction({
        type: "SET_DECK_CROSSFADE",
        deck: "B",
        seconds: 5,
      })
    ).toEqual({ type: "SET_DECK_CROSSFADE", deck: "B", seconds: 5 });
  });

  it("accepts queue actions", () => {
    expect(
      parseRemoteDeckAction({
        type: "ADD_TO_PLAY_QUEUE",
        deck: "A",
        track: sampleTrack,
      })
    ).toMatchObject({ type: "ADD_TO_PLAY_QUEUE", deck: "A" });
    expect(
      parseRemoteDeckAction({
        type: "REMOVE_FROM_PLAY_QUEUE",
        deck: "A",
        index: 0,
      })
    ).toEqual({ type: "REMOVE_FROM_PLAY_QUEUE", deck: "A", index: 0 });
    expect(
      parseRemoteDeckAction({
        type: "MOVE_PLAY_QUEUE_ITEM",
        deck: "A",
        fromIndex: 0,
        toIndex: 1,
      })
    ).toEqual({
      type: "MOVE_PLAY_QUEUE_ITEM",
      deck: "A",
      fromIndex: 0,
      toIndex: 1,
    });
  });

  it("accepts playlist actions", () => {
    expect(
      parseRemoteDeckAction({
        type: "SELECT_PLAYLIST",
        deck: "A",
        playlistId: "pl-1",
        playlistName: "CCS: Steals",
      })
    ).toEqual({
      type: "SELECT_PLAYLIST",
      deck: "A",
      playlistId: "pl-1",
      playlistName: "CCS: Steals",
    });
    expect(
      parseRemoteDeckAction({
        type: "SET_PLAYLIST",
        deck: "A",
        playlist: [sampleTrack],
        playlistTotalDurationMs: 180000,
      })
    ).toMatchObject({ type: "SET_PLAYLIST", deck: "A" });
  });

  it("rejects blocked internal actions", () => {
    expect(parseRemoteDeckAction({ type: "RESTORE_SESSION", state: {} })).toBeNull();
    expect(parseRemoteDeckAction({ type: "ADVANCE_TRACK", deck: "A" })).toBeNull();
    expect(parseRemoteDeckAction({ type: "SET_SAVED_POSITION", deck: "A", positionMs: 0 })).toBeNull();
  });

  it("rejects invalid track shapes", () => {
    expect(
      parseRemoteDeckAction({
        type: "ADD_TO_PLAY_QUEUE",
        deck: "A",
        track: { id: "x" },
      })
    ).toBeNull();
  });

  it("isRemoteDeckAction matches allowlist", () => {
    const action = parseRemoteDeckAction({
      type: "SKIP_UP_NEXT",
      deck: "A",
    });
    expect(action).not.toBeNull();
    if (action) expect(isRemoteDeckAction(action)).toBe(true);
    expect(
      isRemoteDeckAction({ type: "ADVANCE_TRACK", deck: "A" } as never)
    ).toBe(false);
  });

  it("isDebouncedRemoteDeckAction identifies volume actions", () => {
    expect(
      isDebouncedRemoteDeckAction({
        type: "SET_MASTER_VOLUME",
        value: 1,
      })
    ).toBe(true);
    expect(
      isDebouncedRemoteDeckAction({
        type: "ADD_TO_PLAY_QUEUE",
        deck: "A",
        track: sampleTrack,
      })
    ).toBe(false);
  });
});
