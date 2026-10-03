import type { Dispatch } from "react";
import {
  getDeckState,
  getNowPlaying,
  type DjDeckAction,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";
import type { DjPlaybackSnapshot } from "@/lib/spotify/djSession";
import { trackUrisMatch } from "@/lib/spotify/trackUri";

export type HostResumePlayer = {
  playUri: (uri: string, positionMs?: number) => Promise<void>;
  primeTrack: (uri: string) => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
};

export type HostResumeClock = {
  syncFromSdk: (positionMs: number, isPlaying: boolean) => void;
};

export function snapshotMatchesDeckTrack(
  snapshot: DjPlaybackSnapshot,
  deckState: DjDeckState
): boolean {
  const deckTrack = getNowPlaying(deckState);
  if (!snapshot.currentTrackUri) return false;
  if (!deckTrack?.uri) return true;
  return trackUrisMatch(deckTrack.uri, snapshot.currentTrackUri);
}

function alignSnapshotToActiveDeckPlaylist(
  snapshot: DjPlaybackSnapshot,
  deckState: DjDeckState,
  dispatch: Dispatch<DjDeckAction>
): void {
  const uri = snapshot.currentTrackUri;
  if (!uri) return;
  const deck = snapshot.activeDeck;
  const deckSlice = getDeckState(deckState, deck);
  const index = deckSlice.playlist.findIndex((t) => trackUrisMatch(t.uri, uri));
  if (index < 0) return;
  dispatch({ type: "SET_PLAYLIST_INDEX", deck, index });
}

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

  if (!snapshotMatchesDeckTrack(snapshot, deckState)) {
    return;
  }

  alignSnapshotToActiveDeckPlaylist(snapshot, deckState, dispatch);

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
