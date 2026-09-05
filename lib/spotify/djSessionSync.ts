import {
  serializeDjDeckState,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";
import type { DjSessionResponse } from "@/lib/spotify/djSession";

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
