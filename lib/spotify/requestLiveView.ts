import {
  getDeckState,
  getNowPlaying,
  playlistRowStatus,
  type DeckId,
  type DjDeckState,
  type QueueRowStatus,
} from "@/lib/spotify/djDeckState";
import {
  parsePlaybackSnapshot,
  sessionDeckState,
  type DjSessionRow,
} from "@/lib/spotify/djSession";

export type LivePlaylistView = {
  deckAuthority: "social_deck" | "none";
  currentTrackId: string | null;
  activeDeck: DeckId | null;
  deckState: DjDeckState | null;
};

export function createEmptyLivePlaylistView(): LivePlaylistView {
  return {
    deckAuthority: "none",
    currentTrackId: null,
    activeDeck: null,
    deckState: null,
  };
}

export function buildLivePlaylistViewFromSession(
  session: DjSessionRow | null,
  socialPlaylistId: string
): LivePlaylistView {
  if (!session || session.status !== "active") {
    return createEmptyLivePlaylistView();
  }

  const deckState = sessionDeckState(session.deck_state);
  const playback = parsePlaybackSnapshot(session.playback_snapshot);
  const activeDeck = playback.activeDeck;

  const deckA = getDeckState(deckState, "A");
  const deckB = getDeckState(deckState, "B");
  const matchingDeck: DeckId | null =
    deckA.playlistId === socialPlaylistId
      ? "A"
      : deckB.playlistId === socialPlaylistId
        ? "B"
        : null;

  if (!matchingDeck) {
    return createEmptyLivePlaylistView();
  }

  const nowPlaying = getNowPlaying(deckState);
  return {
    deckAuthority: "social_deck",
    currentTrackId: nowPlaying?.id ?? null,
    activeDeck,
    deckState,
  };
}

export function isTrackOnDeck(view: LivePlaylistView, trackId: string): boolean {
  if (view.deckAuthority !== "social_deck" || !view.deckState || !view.activeDeck) {
    return false;
  }
  const deck = getDeckState(view.deckState, view.activeDeck);
  if (deck.track?.id === trackId) return true;
  if (deck.playlist.some((t) => t.id === trackId)) return true;
  if (deck.playQueue.some((t) => t.id === trackId)) return true;
  return false;
}

export function deckIndexForTrackId(
  view: LivePlaylistView,
  trackId: string
): number | null {
  if (view.deckAuthority !== "social_deck" || !view.deckState || !view.activeDeck) {
    return null;
  }
  const deck = getDeckState(view.deckState, view.activeDeck);
  const index = deck.playlist.findIndex((t) => t.id === trackId);
  return index >= 0 ? index : null;
}

export function deckRowStatusForTrack(
  view: LivePlaylistView,
  trackId: string
): QueueRowStatus | null {
  if (view.deckAuthority !== "social_deck" || !view.deckState || !view.activeDeck) {
    return null;
  }
  const deck = getDeckState(view.deckState, view.activeDeck);
  if (deck.track?.id === trackId) return "current";
  const index = deck.playlist.findIndex((t) => t.id === trackId);
  if (index < 0) return null;
  return playlistRowStatus(view.deckState, view.activeDeck, index);
}
