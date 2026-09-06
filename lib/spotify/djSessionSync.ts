import {
  serializeDjDeckState,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";
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
};

/** Whether the Enable audio overlay should show (host / takeover only). */
export function shouldShowAudioOverlay(input: AudioOverlayInput): boolean {
  if (input.sessionLoading) return false;
  if (
    !input.pendingTakeover &&
    (input.isControllerMode || input.role === "controller")
  ) {
    return false;
  }
  if (
    !input.spotifyConnected ||
    input.needsDeckReconnect ||
    !input.isPremium
  ) {
    return false;
  }
  return (
    (input.pendingTakeover || input.role !== "controller") &&
    !input.audioUnlocked &&
    !input.playerReady
  );
}

export function shouldSkipDeckRestore(
  incoming: DjSessionResponse,
  localDeck: DjDeckState,
  shouldApplyDeckState?: (
    incoming: DjSessionResponse,
    current: DjSessionResponse | null
  ) => boolean,
  currentSession?: DjSessionResponse | null
): boolean {
  if (deckStatesEqual(incoming.deckState, localDeck)) return true;
  if (shouldApplyDeckState && !shouldApplyDeckState(incoming, currentSession ?? null)) {
    return true;
  }
  return false;
}
