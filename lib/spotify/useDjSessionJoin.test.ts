import { describe, expect, it } from "vitest";
import { INITIAL_DJ_DECK_STATE } from "@/lib/spotify/djDeckState";
import {
  shouldApplyPersistResponse,
  shouldFullRestoreOnJoin,
  shouldIgnoreOwnPersistEcho,
  shouldSchedulePersist,
  shouldShowAudioOverlay,
  canActAsPlaybackHost,
  isEffectiveRemoteController,
  shouldPersistAsPlaybackHost,
} from "@/lib/spotify/djSessionSync";

describe("useDjSession join helpers", () => {
  it("requires full restore on first join", () => {
    expect(shouldFullRestoreOnJoin(null, "sess-1")).toBe(true);
  });

  it("requires full restore when session id changes", () => {
    expect(shouldFullRestoreOnJoin("sess-1", "sess-2")).toBe(true);
  });

  it("skips full restore when re-joining same session", () => {
    expect(shouldFullRestoreOnJoin("sess-1", "sess-1")).toBe(false);
  });
});

describe("persist response helpers", () => {
  it("accepts response when deck hash unchanged during flight", () => {
    expect(
      shouldApplyPersistResponse(
        JSON.stringify(INITIAL_DJ_DECK_STATE),
        INITIAL_DJ_DECK_STATE
      )
    ).toBe(true);
  });

  it("rejects response when deck changed during flight", () => {
    const hashAtStart = JSON.stringify(INITIAL_DJ_DECK_STATE);
    expect(
      shouldApplyPersistResponse(hashAtStart, {
        ...INITIAL_DJ_DECK_STATE,
        masterVolume: 0.5,
      })
    ).toBe(false);
  });
});

describe("own persist echo suppression", () => {
  it("ignores host echo of own persist when deck matches", () => {
    expect(
      shouldIgnoreOwnPersistEcho(
        true,
        5,
        5,
        INITIAL_DJ_DECK_STATE,
        INITIAL_DJ_DECK_STATE
      )
    ).toBe(true);
  });

  it("does not ignore when version differs", () => {
    expect(
      shouldIgnoreOwnPersistEcho(
        true,
        6,
        5,
        INITIAL_DJ_DECK_STATE,
        INITIAL_DJ_DECK_STATE
      )
    ).toBe(false);
  });

  it("does not ignore for controllers", () => {
    expect(
      shouldIgnoreOwnPersistEcho(
        false,
        5,
        5,
        INITIAL_DJ_DECK_STATE,
        INITIAL_DJ_DECK_STATE
      )
    ).toBe(false);
  });
});

describe("shouldSchedulePersist", () => {
  it("allows persist only for host role", () => {
    expect(shouldSchedulePersist("host")).toBe(true);
    expect(shouldSchedulePersist("controller")).toBe(false);
    expect(shouldSchedulePersist("idle")).toBe(false);
  });
});

describe("playback host tab helpers", () => {
  it("primary host tab can act as playback host", () => {
    expect(canActAsPlaybackHost("host", true, false)).toBe(true);
  });

  it("duplicate host tab cannot act as playback host", () => {
    expect(canActAsPlaybackHost("host", true, true)).toBe(false);
  });

  it("treats duplicate host tab as effective remote controller", () => {
    expect(isEffectiveRemoteController("host", true, true)).toBe(true);
    expect(isEffectiveRemoteController("controller", true, false)).toBe(true);
    expect(isEffectiveRemoteController("host", true, false)).toBe(false);
  });

  it("does not persist from duplicate host tab", () => {
    expect(shouldPersistAsPlaybackHost("host", true, true)).toBe(false);
    expect(shouldPersistAsPlaybackHost("host", true, false)).toBe(true);
  });
});

describe("shouldShowAudioOverlay", () => {
  const base = {
    pendingTakeover: false,
    audioUnlocked: false,
    playerReady: false,
    spotifyConnected: true,
    needsDeckReconnect: false,
    isPremium: true,
    sessionLoading: false,
  };

  it("hides overlay for remote controller", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "controller",
        isControllerMode: true,
      })
    ).toBe(false);
  });

  it("hides overlay while session join is loading", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "idle",
        isControllerMode: false,
        sessionLoading: true,
      })
    ).toBe(false);
  });

  it("shows overlay for idle host before audio unlock", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "idle",
        isControllerMode: false,
      })
    ).toBe(true);
  });

  it("shows overlay for host role before unlock", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "host",
        isControllerMode: false,
      })
    ).toBe(true);
  });

  it("hides overlay after player is ready", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "host",
        isControllerMode: false,
        playerReady: true,
      })
    ).toBe(false);
  });

  it("shows overlay for pending takeover", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "controller",
        isControllerMode: false,
        pendingTakeover: true,
      })
    ).toBe(true);
  });
});
