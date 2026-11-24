import { describe, expect, it } from "vitest";
import {
  djDeckReducer,
  INITIAL_DJ_DECK_STATE,
  type DeckTrack,
} from "@/lib/spotify/djDeckState";
import {
  shouldApplyPersistResponse,
  shouldFullRestoreOnJoin,
  shouldIgnoreOwnPersistEcho,
  shouldSchedulePersist,
  shouldShowAudioOverlay,
  shouldAutoUnlockAppleHostAudio,
  shouldMergePlaylistLoad,
  shouldRestoreDeckOnPersistConflict,
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

  it("shows overlay for pending takeover when remote tab already unlocked audio", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "controller",
        isControllerMode: false,
        pendingTakeover: true,
        audioUnlocked: true,
        playerReady: false,
      })
    ).toBe(true);
  });

  it("hides overlay for pending takeover once player is ready", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "controller",
        isControllerMode: false,
        pendingTakeover: true,
        audioUnlocked: true,
        playerReady: true,
      })
    ).toBe(false);
  });

  it("shows enable-audio overlay for Apple when authorized but not unlocked", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "host",
        isControllerMode: false,
        useAppleMusic: true,
        appleMusicConfigured: true,
        appleMusicAuthorized: true,
        audioUnlocked: false,
        playerReady: false,
      })
    ).toBe(true);
  });

  it("hides enable-audio overlay for Apple when not yet authorized", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "host",
        isControllerMode: false,
        useAppleMusic: true,
        appleMusicConfigured: true,
        appleMusicAuthorized: false,
        audioUnlocked: false,
        playerReady: false,
      })
    ).toBe(false);
  });

  it("hides enable-audio overlay for Apple after auto audio unlock", () => {
    expect(
      shouldShowAudioOverlay({
        ...base,
        role: "host",
        isControllerMode: false,
        useAppleMusic: true,
        appleMusicConfigured: true,
        appleMusicAuthorized: true,
        audioUnlocked: true,
        playerReady: true,
      })
    ).toBe(false);
  });
});

describe("shouldAutoUnlockAppleHostAudio", () => {
  const base = {
    useAppleMusic: true,
    isControllerMode: false,
    pendingTakeover: false,
    playerReady: true,
    appleMusicAuthorized: true,
  };

  it("unlocks when Apple host is ready and authorized", () => {
    expect(shouldAutoUnlockAppleHostAudio(base)).toBe(true);
  });

  it("does not unlock when not authorized", () => {
    expect(
      shouldAutoUnlockAppleHostAudio({ ...base, appleMusicAuthorized: false })
    ).toBe(false);
  });

  it("does not unlock when player is not ready", () => {
    expect(
      shouldAutoUnlockAppleHostAudio({ ...base, playerReady: false })
    ).toBe(false);
  });

  it("does not unlock in controller mode", () => {
    expect(
      shouldAutoUnlockAppleHostAudio({ ...base, isControllerMode: true })
    ).toBe(false);
  });

  it("does not unlock during pending takeover", () => {
    expect(
      shouldAutoUnlockAppleHostAudio({ ...base, pendingTakeover: true })
    ).toBe(false);
  });

  it("does not unlock on Spotify deck", () => {
    expect(
      shouldAutoUnlockAppleHostAudio({ ...base, useAppleMusic: false })
    ).toBe(false);
  });
});

describe("shouldMergePlaylistLoad", () => {
  it("merges when session active and playlist id matches with tracks loaded", () => {
    expect(
      shouldMergePlaylistLoad({
        sessionActive: true,
        existingPlaylistId: "p-1",
        incomingPlaylistId: "p-1",
        existingPlaylistLength: 8,
      })
    ).toBe("merge");
  });

  it("replaces when session inactive", () => {
    expect(
      shouldMergePlaylistLoad({
        sessionActive: false,
        existingPlaylistId: "p-1",
        incomingPlaylistId: "p-1",
        existingPlaylistLength: 8,
      })
    ).toBe("replace");
  });

  it("replaces when playlist id changes", () => {
    expect(
      shouldMergePlaylistLoad({
        sessionActive: true,
        existingPlaylistId: "p-1",
        incomingPlaylistId: "p-2",
        existingPlaylistLength: 8,
      })
    ).toBe("replace");
  });

  it("replaces when no tracks loaded yet", () => {
    expect(
      shouldMergePlaylistLoad({
        sessionActive: true,
        existingPlaylistId: "p-1",
        incomingPlaylistId: "p-1",
        existingPlaylistLength: 0,
      })
    ).toBe("replace");
  });
});

describe("shouldRestoreDeckOnPersistConflict", () => {
  const t = (id: string): DeckTrack => ({
    id,
    uri: `spotify:track:${id}`,
    name: id,
    primaryArtist: "A",
    durationMs: 180000,
  });

  function stateWithPlaylist(ids: string[]) {
    const playlist = ids.map(t);
    return djDeckReducer(INITIAL_DJ_DECK_STATE, {
      type: "SET_PLAYLIST",
      deck: "A",
      playlist,
      playlistTotalDurationMs: playlist.length * 180000,
    });
  }

  it("allows restore when playlists match", () => {
    const local = stateWithPlaylist(["a", "b"]);
    const remote = stateWithPlaylist(["a", "b"]);
    expect(shouldRestoreDeckOnPersistConflict(local, remote)).toBe(true);
  });

  it("blocks restore when local playlist differs from server", () => {
    const local = stateWithPlaylist(["a", "b", "whiskey"]);
    const remote = stateWithPlaylist(["a", "b", "teddy"]);
    expect(shouldRestoreDeckOnPersistConflict(local, remote)).toBe(false);
  });
});
