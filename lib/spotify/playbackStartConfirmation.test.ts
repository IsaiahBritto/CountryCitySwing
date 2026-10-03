import { describe, expect, it, vi } from "vitest";
import {
  isPlaybackConfirmed,
  isUriMatchForPlayback,
  pollPlaybackConfirmation,
  resolvePlayConfirmationFailure,
  shouldAttemptResumeBeforePlay,
} from "@/lib/spotify/playbackStartConfirmation";

describe("isUriMatchForPlayback", () => {
  it("matches spotify track uris by id", () => {
    expect(
      isUriMatchForPlayback(
        "spotify:track:abc123",
        "spotify:track:abc123"
      )
    ).toBe(true);
  });
});

describe("shouldAttemptResumeBeforePlay", () => {
  it("returns true when uri matches and paused", () => {
    expect(
      shouldAttemptResumeBeforePlay(
        {
          isPlaying: false,
          positionMs: 0,
          durationMs: 180000,
          currentTrackUri: "spotify:track:abc",
        },
        "spotify:track:abc"
      )
    ).toBe(true);
  });

  it("returns false when already playing", () => {
    expect(
      shouldAttemptResumeBeforePlay(
        {
          isPlaying: true,
          positionMs: 1000,
          durationMs: 180000,
          currentTrackUri: "spotify:track:abc",
        },
        "spotify:track:abc"
      )
    ).toBe(false);
  });

  it("returns false when uri differs", () => {
    expect(
      shouldAttemptResumeBeforePlay(
        {
          isPlaying: false,
          positionMs: 0,
          durationMs: 180000,
          currentTrackUri: "spotify:track:other",
        },
        "spotify:track:abc"
      )
    ).toBe(false);
  });
});

describe("isPlaybackConfirmed", () => {
  it("requires playing and uri match", () => {
    expect(
      isPlaybackConfirmed("spotify:track:abc", {
        isPlaying: true,
        positionMs: 500,
        durationMs: 180000,
        currentTrackUri: "spotify:track:abc",
      })
    ).toBe(true);
    expect(
      isPlaybackConfirmed("spotify:track:abc", {
        isPlaying: false,
        positionMs: 500,
        durationMs: 180000,
        currentTrackUri: "spotify:track:abc",
      })
    ).toBe(false);
  });
});

describe("resolvePlayConfirmationFailure", () => {
  it("prefers sdk error message", () => {
    expect(
      resolvePlayConfirmationFailure({
        lastSdkError: "Something went wrong",
        persistentStateNull: false,
      })
    ).toContain("Something went wrong");
  });

  it("uses interrupted copy when state persistently null", () => {
    expect(
      resolvePlayConfirmationFailure({
        persistentStateNull: true,
      })
    ).toContain("another device");
  });

  it("uses neutral copy otherwise", () => {
    expect(
      resolvePlayConfirmationFailure({
        persistentStateNull: false,
      })
    ).toContain("didn't start");
  });
});

describe("pollPlaybackConfirmation", () => {
  it("succeeds when playing on second poll", async () => {
    const syncState = vi
      .fn()
      .mockResolvedValueOnce({
        isPlaying: false,
        positionMs: 0,
        durationMs: 180000,
        currentTrackUri: "spotify:track:abc",
      })
      .mockResolvedValueOnce({
        isPlaying: true,
        positionMs: 100,
        durationMs: 180000,
        currentTrackUri: "spotify:track:abc",
      });
    const tryResume = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollPlaybackConfirmation(
      "spotify:track:abc",
      { syncState, tryResume, sleep },
      { maxMs: 500, intervalMs: 10 }
    );

    expect(result.ok).toBe(true);
    expect(tryResume).toHaveBeenCalledTimes(1);
  });

  it("reports persistentStateNull when sync always null", async () => {
    const syncState = vi.fn().mockResolvedValue(null);
    const tryResume = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollPlaybackConfirmation(
      "spotify:track:abc",
      { syncState, tryResume, sleep },
      { maxMs: 50, intervalMs: 10 }
    );

    expect(result.ok).toBe(false);
    expect(result.persistentStateNull).toBe(true);
  });
});
