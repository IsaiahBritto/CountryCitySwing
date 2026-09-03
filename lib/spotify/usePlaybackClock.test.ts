import { describe, expect, it } from "vitest";
import {
  computeDisplayPositionMs,
  pauseClock,
  resetClock,
  resumeClock,
  syncClockFromSdk,
} from "@/lib/spotify/usePlaybackClock";

describe("computeDisplayPositionMs", () => {
  it("returns offset when paused", () => {
    expect(
      computeDisplayPositionMs({
        offsetMs: 5000,
        startedAtMs: null,
        isPlaying: false,
        durationMs: 180000,
        nowMs: 10000,
      })
    ).toBe(5000);
  });

  it("adds elapsed time while playing", () => {
    expect(
      computeDisplayPositionMs({
        offsetMs: 5000,
        startedAtMs: 8000,
        isPlaying: true,
        durationMs: 180000,
        nowMs: 11000,
      })
    ).toBe(8000);
  });

  it("caps at duration", () => {
    expect(
      computeDisplayPositionMs({
        offsetMs: 170000,
        startedAtMs: 170000,
        isPlaying: true,
        durationMs: 180000,
        nowMs: 200000,
      })
    ).toBe(180000);
  });
});

describe("clock state transitions", () => {
  it("reset starts from zero offset with startedAt", () => {
    const state = resetClock(1000);
    expect(state.offsetMs).toBe(0);
    expect(state.startedAtMs).toBe(1000);
  });

  it("pause accumulates elapsed into offset", () => {
    const playing = resetClock(1000);
    const paused = pauseClock(playing, 4000);
    expect(paused.offsetMs).toBe(3000);
    expect(paused.startedAtMs).toBeNull();
  });

  it("resume keeps offset and sets startedAt", () => {
    const paused = { offsetMs: 3000, startedAtMs: null };
    const resumed = resumeClock(paused, 5000);
    expect(resumed.offsetMs).toBe(3000);
    expect(resumed.startedAtMs).toBe(5000);
  });

  it("syncFromSdk snaps offset", () => {
    const synced = syncClockFromSdk(
      { offsetMs: 0, startedAtMs: null },
      12000,
      true,
      9000
    );
    expect(synced.offsetMs).toBe(12000);
    expect(synced.startedAtMs).toBe(9000);
  });
});
