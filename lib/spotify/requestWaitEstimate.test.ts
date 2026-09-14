import { describe, expect, it } from "vitest";
import {
  estimateWaitForTrack,
  formatEstimatedWait,
} from "@/lib/spotify/requestWaitEstimate";
import type { DjPlaybackSnapshot } from "@/lib/spotify/djSession";

const track = (id: string, durationMs: number) => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  primaryArtist: "Artist",
  durationMs,
});

describe("estimateWaitForTrack", () => {
  const playback: DjPlaybackSnapshot = {
    isPlaying: true,
    positionMs: 60_000,
    currentTrackUri: "spotify:track:a",
    activeDeck: "A",
    updatedAt: new Date().toISOString(),
  };

  it("returns now_playing for the current track", () => {
    const stream = [track("a", 180_000), track("b", 200_000)];
    expect(estimateWaitForTrack("a", stream, playback)).toEqual({
      status: "now_playing",
      estimatedWaitMs: 0,
    });
  });

  it("sums remaining current track plus prior upcoming durations", () => {
    const stream = [
      track("a", 180_000),
      track("b", 200_000),
      track("c", 240_000),
    ];
    expect(estimateWaitForTrack("c", stream, playback)).toEqual({
      status: "queued",
      estimatedWaitMs: 120_000 + 200_000,
    });
  });

  it("returns unknown when track is not in stream", () => {
    const stream = [track("a", 180_000), track("b", 200_000)];
    expect(estimateWaitForTrack("z", stream, playback)).toEqual({
      status: "unknown",
      estimatedWaitMs: null,
    });
  });
});

describe("formatEstimatedWait", () => {
  it("formats common cases", () => {
    expect(formatEstimatedWait(0)).toBe("Playing now");
    expect(formatEstimatedWait(null)).toBe("Estimate unavailable");
    expect(formatEstimatedWait(90_000)).toBe("~2 min");
  });
});
