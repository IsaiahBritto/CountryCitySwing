import { describe, expect, it } from "vitest";
import {
  shouldReRenderAfterClockSync,
  shouldSyncClockFromSdk,
  SDK_CLOCK_SYNC_THRESHOLD_MS,
} from "@/lib/spotify/playbackClockSync";
import { controllerSnapshotsEqual } from "@/lib/spotify/controllerPlaybackSnapshot";

describe("shouldSyncClockFromSdk", () => {
  const base = {
    trackUri: "spotify:track:abc",
    isPlaying: true,
    positionMs: 1000,
  };

  it("syncs when no prior sync", () => {
    expect(shouldSyncClockFromSdk(null, base)).toBe(true);
  });

  it("syncs when track uri changes", () => {
    expect(
      shouldSyncClockFromSdk(base, { ...base, trackUri: "spotify:track:xyz" })
    ).toBe(true);
  });

  it("syncs when play state changes", () => {
    expect(
      shouldSyncClockFromSdk(base, { ...base, isPlaying: false })
    ).toBe(true);
  });

  it("skips small position drift", () => {
    expect(
      shouldSyncClockFromSdk(base, {
        ...base,
        positionMs: base.positionMs + SDK_CLOCK_SYNC_THRESHOLD_MS - 1,
      })
    ).toBe(false);
  });

  it("syncs when position drift exceeds threshold", () => {
    expect(
      shouldSyncClockFromSdk(base, {
        ...base,
        positionMs: base.positionMs + SDK_CLOCK_SYNC_THRESHOLD_MS,
      })
    ).toBe(true);
  });
});

describe("shouldReRenderAfterClockSync", () => {
  it("skips re-render when playing resync only resets startedAtMs", () => {
    expect(
      shouldReRenderAfterClockSync(
        { offsetMs: 5000, startedAtMs: 1000 },
        { offsetMs: 5000, startedAtMs: 9000 },
        true,
        true
      )
    ).toBe(false);
  });

  it("re-renders when play state changes", () => {
    expect(
      shouldReRenderAfterClockSync(
        { offsetMs: 5000, startedAtMs: 1000 },
        { offsetMs: 5000, startedAtMs: 9000 },
        true,
        false
      )
    ).toBe(true);
  });

  it("re-renders when offset jumps beyond threshold", () => {
    expect(
      shouldReRenderAfterClockSync(
        { offsetMs: 1000, startedAtMs: 1000 },
        { offsetMs: 1000 + SDK_CLOCK_SYNC_THRESHOLD_MS, startedAtMs: 2000 },
        true,
        true
      )
    ).toBe(true);
  });

  it("re-renders when paused and offset changes", () => {
    expect(
      shouldReRenderAfterClockSync(
        { offsetMs: 1000, startedAtMs: null },
        { offsetMs: 1500, startedAtMs: null },
        false,
        false
      )
    ).toBe(true);
  });
});

describe("controllerSnapshotsEqual", () => {
  it("compares all fields", () => {
    const snap = {
      isPlaying: true,
      positionMs: 5000,
      durationMs: 180000,
      currentTrackUri: "spotify:track:1",
    };
    expect(controllerSnapshotsEqual(snap, { ...snap })).toBe(true);
    expect(
      controllerSnapshotsEqual(snap, { ...snap, positionMs: snap.positionMs + 1 })
    ).toBe(false);
  });
});
