import { describe, expect, it, vi } from "vitest";
import { INITIAL_DJ_DECK_STATE } from "@/lib/spotify/djDeckState";
import { createEmptyPlaybackSnapshot } from "@/lib/spotify/djSession";
import { resumeHostFromSnapshot } from "@/lib/spotify/hostSessionResume";

describe("resumeHostFromSnapshot", () => {
  it("resumes playing snapshot with playUri", async () => {
    const playUri = vi.fn().mockResolvedValue(undefined);
    const primeTrack = vi.fn();
    const seek = vi.fn();
    const syncFromSdk = vi.fn();
    const dispatch = vi.fn();

    await resumeHostFromSnapshot({
      snapshot: {
        ...createEmptyPlaybackSnapshot("A"),
        isPlaying: true,
        positionMs: 12000,
        currentTrackUri: "spotify:track:abc",
      },
      deckState: INITIAL_DJ_DECK_STATE,
      player: { playUri, primeTrack, seek },
      dispatch,
      syncClock: { syncFromSdk },
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_SAVED_POSITION",
      deck: "A",
      positionMs: 12000,
    });
    expect(playUri).toHaveBeenCalledWith("spotify:track:abc", 12000);
    expect(syncFromSdk).toHaveBeenCalledWith(12000, true);
    expect(primeTrack).not.toHaveBeenCalled();
  });

  it("resumes paused snapshot with prime and seek", async () => {
    const playUri = vi.fn();
    const primeTrack = vi.fn().mockResolvedValue(undefined);
    const seek = vi.fn().mockResolvedValue(undefined);
    const syncFromSdk = vi.fn();
    const dispatch = vi.fn();

    await resumeHostFromSnapshot({
      snapshot: {
        ...createEmptyPlaybackSnapshot("B"),
        isPlaying: false,
        positionMs: 8000,
        currentTrackUri: "spotify:track:xyz",
        activeDeck: "B",
      },
      deckState: INITIAL_DJ_DECK_STATE,
      player: { playUri, primeTrack, seek },
      dispatch,
      syncClock: { syncFromSdk },
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_SAVED_POSITION",
      deck: "B",
      positionMs: 8000,
    });
    expect(primeTrack).toHaveBeenCalledWith("spotify:track:xyz");
    expect(seek).toHaveBeenCalledWith(8000);
    expect(syncFromSdk).toHaveBeenCalledWith(8000, false);
    expect(playUri).not.toHaveBeenCalled();
  });

  it("no-ops when snapshot has no track uri", async () => {
    const playUri = vi.fn();
    const dispatch = vi.fn();

    await resumeHostFromSnapshot({
      snapshot: createEmptyPlaybackSnapshot(),
      deckState: INITIAL_DJ_DECK_STATE,
      player: {
        playUri,
        primeTrack: vi.fn(),
        seek: vi.fn(),
      },
      dispatch,
      syncClock: { syncFromSdk: vi.fn() },
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(playUri).not.toHaveBeenCalled();
  });
});
