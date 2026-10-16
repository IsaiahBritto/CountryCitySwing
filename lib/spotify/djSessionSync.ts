import {
  getDeckState,
  getNowPlaying,
  serializeDjDeckState,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";
import { playlistsNeedSnapshotSync } from "@/lib/spotify/deckPlaylistSync";
import { trackUrisMatch } from "@/lib/spotify/trackUri";
import type { DjSessionResponse, DjSessionRole } from "@/lib/spotify/djSession";

export function deckStateContentHash(state: DjDeckState): string {
  return JSON.stringify(serializeDjDeckState(state));
}

export function deckStatesEqual(a: DjDeckState, b: DjDeckState): boolean {
  return deckStateContentHash(a) === deckStateContentHash(b);
}

export function mergeSessionMetadata(
  current: DjSessionResponse | null,
  incoming: DjSessionResponse
): DjSessionResponse {
  if (!current) return incoming;
  return {
    ...current,
    status: incoming.status,
    stateVersion: incoming.stateVersion,
    hostStatus: incoming.hostStatus,
    playbackSnapshot: incoming.playbackSnapshot,
    hostClientId: incoming.hostClientId,
    hostDeviceId: incoming.hostDeviceId,
    hostLastSeenAt: incoming.hostLastSeenAt,
    updatedAt: incoming.updatedAt,
  };
}

/** Full RESTORE_SESSION on join only when no session yet or session id changed. */
export function shouldFullRestoreOnJoin(
  existingSessionId: string | null,
  incomingSessionId: string
): boolean {
  if (!existingSessionId) return true;
  return existingSessionId !== incomingSessionId;
}

export function shouldIgnoreOwnPersistEcho(
  isHost: boolean,
  incomingVersion: number,
  lastOwnPersistVersion: number,
  incomingDeck: DjDeckState,
  localDeck: DjDeckState
): boolean {
  return (
    isHost &&
    incomingVersion === lastOwnPersistVersion &&
    deckStatesEqual(incomingDeck, localDeck)
  );
}

export function shouldApplyPersistResponse(
  hashAtStart: string,
  currentDeck: DjDeckState
): boolean {
  return deckStateContentHash(currentDeck) === hashAtStart;
}

/** On 409, avoid RESTORE_SESSION when local playlist already diverged from server (newer snapshot). */
export function shouldRestoreDeckOnPersistConflict(
  localDeck: DjDeckState,
  serverDeck: DjDeckState
): boolean {
  const deckId = localDeck.activeDeck;
  const localPl = getDeckState(localDeck, deckId).playlist;
  const remotePl = getDeckState(serverDeck, deckId).playlist;
  return !playlistsNeedSnapshotSync(localPl, remotePl);
}

/** Only the playback host may PATCH deck state to the session. */
export function shouldSchedulePersist(role: DjSessionRole): boolean {
  return role === "host";
}

/** True when this tab should connect Spotify SDK and drive playback. */
export function canActAsPlaybackHost(
  role: DjSessionRole,
  sessionActive: boolean,
  otherHostTabActive: boolean
): boolean {
  return role === "host" && sessionActive && !otherHostTabActive;
}

/** Host role in another tab, or explicit controller — remote control only. */
export function isEffectiveRemoteController(
  role: DjSessionRole,
  sessionActive: boolean,
  otherHostTabActive: boolean
): boolean {
  return (
    role === "controller" ||
    (role === "host" && sessionActive && otherHostTabActive)
  );
}

export function shouldPersistAsPlaybackHost(
  role: DjSessionRole,
  sessionActive: boolean,
  otherHostTabActive: boolean
): boolean {
  return (
    shouldSchedulePersist(role) &&
    canActAsPlaybackHost(role, sessionActive, otherHostTabActive)
  );
}

export type AudioOverlayInput = {
  role: DjSessionRole;
  isControllerMode: boolean;
  pendingTakeover: boolean;
  audioUnlocked: boolean;
  playerReady: boolean;
  spotifyConnected: boolean;
  needsDeckReconnect: boolean;
  isPremium: boolean;
  sessionLoading: boolean;
  useAppleMusic?: boolean;
  appleMusicConfigured?: boolean;
  appleMusicAuthorized?: boolean;
};

/** Whether the Enable audio overlay should show (host / takeover only). */
export function shouldShowAudioOverlay(input: AudioOverlayInput): boolean {
  if (input.sessionLoading) return false;
  if (input.useAppleMusic) {
    if (!input.appleMusicConfigured || !input.appleMusicAuthorized) {
      return false;
    }
  } else if (
    !input.spotifyConnected ||
    input.needsDeckReconnect ||
    !input.isPremium
  ) {
    return false;
  }
  if (input.pendingTakeover) {
    return !input.playerReady;
  }
  if (input.isControllerMode || input.role === "controller") {
    return false;
  }
  return !input.audioUnlocked && !input.playerReady;
}

export type AppleHostAudioUnlockInput = {
  useAppleMusic: boolean;
  isControllerMode: boolean;
  pendingTakeover: boolean;
  playerReady: boolean;
  appleMusicAuthorized: boolean;
};

/** Host Apple deck: treat audio as unlocked once MusicKit is ready and authorized. */
export function shouldAutoUnlockAppleHostAudio(
  input: AppleHostAudioUnlockInput
): boolean {
  if (!input.useAppleMusic) return false;
  if (input.isControllerMode || input.pendingTakeover) return false;
  return input.playerReady && input.appleMusicAuthorized;
}

export type PlaylistLoadStrategy = "merge" | "replace";

export function shouldMergePlaylistLoad(input: {
  sessionActive: boolean;
  existingPlaylistId: string | null;
  incomingPlaylistId: string;
  existingPlaylistLength: number;
}): PlaylistLoadStrategy {
  if (
    input.sessionActive &&
    input.existingPlaylistLength > 0 &&
    input.existingPlaylistId != null &&
    input.existingPlaylistId === input.incomingPlaylistId
  ) {
    return "merge";
  }
  return "replace";
}

export type HostPlaybackContext = {
  isPlaybackHost: boolean;
  isSdkPlaying: boolean;
  sdkTrackUri: string | null;
};

/** Host is playing; do not RESTORE deck from stale or lagging session rows. */
export function shouldSkipDeckRestoreForPlaybackHost(
  localDeck: DjDeckState,
  incomingDeck: DjDeckState,
  playback: Pick<HostPlaybackContext, "isSdkPlaying" | "sdkTrackUri">
): boolean {
  const localTrack = getNowPlaying(localDeck);
  if (
    playback.isSdkPlaying &&
    localTrack?.uri &&
    playback.sdkTrackUri &&
    trackUrisMatch(localTrack.uri, playback.sdkTrackUri)
  ) {
    return true;
  }

  const deckId = localDeck.activeDeck;
  const localPl = getDeckState(localDeck, deckId).playlist;
  const remotePl = getDeckState(incomingDeck, deckId).playlist;
  if (!playlistsNeedSnapshotSync(localPl, remotePl)) {
    return false;
  }

  const localNow = getNowPlaying(localDeck);
  const remoteNow = getNowPlaying(incomingDeck);
  if (localNow?.id && remoteNow?.id && localNow.id === remoteNow.id) {
    return true;
  }
  if (
    localNow?.uri &&
    remoteNow?.uri &&
    trackUrisMatch(localNow.uri, remoteNow.uri)
  ) {
    return true;
  }
  return false;
}

export function shouldSkipDeckRestore(
  incoming: DjSessionResponse,
  localDeck: DjDeckState,
  shouldApplyDeckState?: (
    incoming: DjSessionResponse,
    current: DjSessionResponse | null
  ) => boolean,
  currentSession?: DjSessionResponse | null,
  hostPlayback?: HostPlaybackContext | null
): boolean {
  if (deckStatesEqual(incoming.deckState, localDeck)) return true;
  if (shouldApplyDeckState && !shouldApplyDeckState(incoming, currentSession ?? null)) {
    return true;
  }
  if (
    hostPlayback?.isPlaybackHost &&
    shouldSkipDeckRestoreForPlaybackHost(
      localDeck,
      incoming.deckState,
      hostPlayback
    )
  ) {
    return true;
  }
  return false;
}
