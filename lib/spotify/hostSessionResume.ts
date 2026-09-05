import type { Dispatch } from "react";
import {
  type DjDeckAction,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";
import type { DjPlaybackSnapshot } from "@/lib/spotify/djSession";

export type HostResumePlayer = {
  playUri: (uri: string, positionMs?: number) => Promise<void>;
  primeTrack: (uri: string) => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
};

export type HostResumeClock = {
  syncFromSdk: (positionMs: number, isPlaying: boolean) => void;
};

export async function resumeHostFromSnapshot(params: {
  snapshot: DjPlaybackSnapshot;
  deckState: DjDeckState;
  player: HostResumePlayer;
  dispatch: Dispatch<DjDeckAction>;
  syncClock: HostResumeClock;
}): Promise<void> {
  const { snapshot, deckState, player, dispatch, syncClock } = params;
  const uri = snapshot.currentTrackUri;
  if (!uri) return;

  const deck = snapshot.activeDeck;
  const positionMs = Math.max(0, snapshot.positionMs);

  dispatch({ type: "SET_SAVED_POSITION", deck, positionMs });

  if (snapshot.isPlaying) {
    await player.playUri(uri, positionMs);
    syncClock.syncFromSdk(positionMs, true);
    return;
  }

  await player.primeTrack(uri);
  await player.seek(positionMs);
  syncClock.syncFromSdk(positionMs, false);
}
