import { describe, expect, it } from "vitest";
import {
  playbackStateNeedsResetBeforeNewQueue,
  resumeNeedsPauseBeforePlay,
} from "@/lib/appleMusic/playbackTransition";
import type { MusicKitPlaybackState } from "@/lib/appleMusic/musicKitTypes";

describe("playbackStateNeedsResetBeforeNewQueue", () => {
  it("uses pause path when isPlaying", () => {
    expect(playbackStateNeedsResetBeforeNewQueue("completed", true)).toBe(
      false
    );
  });

  it("requires stop after terminal states when not playing", () => {
    for (const state of ["completed", "ended"] as MusicKitPlaybackState[]) {
      expect(playbackStateNeedsResetBeforeNewQueue(state, false)).toBe(true);
    }
  });

  it("requires stop for active non-playing states", () => {
    for (const state of [
      "playing",
      "waiting",
      "seeking",
      "loading",
      "interrupted",
    ] as MusicKitPlaybackState[]) {
      expect(playbackStateNeedsResetBeforeNewQueue(state, false)).toBe(true);
    }
  });

  it("does not reset when idle", () => {
    for (const state of ["paused", "stopped", "none"] as MusicKitPlaybackState[]) {
      expect(playbackStateNeedsResetBeforeNewQueue(state, false)).toBe(false);
    }
  });
});

describe("resumeNeedsPauseBeforePlay", () => {
  it("no-op when already playing", () => {
    expect(resumeNeedsPauseBeforePlay("paused", true)).toBe(false);
  });

  it("allows direct play from paused/stopped/none", () => {
    expect(resumeNeedsPauseBeforePlay("paused", false)).toBe(false);
    expect(resumeNeedsPauseBeforePlay("stopped", false)).toBe(false);
    expect(resumeNeedsPauseBeforePlay("none", false)).toBe(false);
  });

  it("pauses first from completed/ended", () => {
    expect(resumeNeedsPauseBeforePlay("completed", false)).toBe(true);
    expect(resumeNeedsPauseBeforePlay("ended", false)).toBe(true);
  });
});
