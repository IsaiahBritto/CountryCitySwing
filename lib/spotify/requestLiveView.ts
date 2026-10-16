import {
  getDeckState,
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
  /** Social deck's current playlist row track id (not global active-deck playback). */
  currentTrackId: string | null;
  /** Deck holding the social playlist; authoritative for guest request deck logic. */
  socialDeck: DeckId | null;
  /** Globally active playback deck from session snapshot (diagnostics / social UI). */
  activeDeck: DeckId | null;
  deckState: DjDeckState | null;
};

export function createEmptyLivePlaylistView(): LivePlaylistView {
  return {
    deckAuthority: "none",
    currentTrackId: null,
    socialDeck: null,
    activeDeck: null,
    deckState: null,
  };
}

function socialDeckPlayheadTrackId(
  deckState: DjDeckState,
  socialDeck: DeckId
): string | null {
  const deck = getDeckState(deckState, socialDeck);
  if (deck.track?.id) return deck.track.id;
  if (
    deck.playbackSource === "playlist" &&
    deck.playlistIndex != null &&
    deck.playlistIndex >= 0 &&
    deck.playlistIndex < deck.playlist.length
  ) {
    return deck.playlist[deck.playlistIndex]?.id ?? null;
  }
  return null;
}

/**
 * Snapshot index for genre-slot targeting from the social deck playhead.
 */
export function resolveSocialPlayheadSnapshotIndex(
  tracks: { spotifyTrackId: string }[],
  view: LivePlaylistView
): number {
  if (
    view.deckAuthority !== "social_deck" ||
    !view.deckState ||
    !view.socialDeck
  ) {
    return -1;
  }

  const social = getDeckState(view.deckState, view.socialDeck);
  const rowTrackId = socialDeckPlayheadTrackId(view.deckState, view.socialDeck);
  if (rowTrackId) {
    const index = tracks.findIndex((t) => t.spotifyTrackId === rowTrackId);
    if (index >= 0) return index;
  }

  if (
    social.playbackSource === "playlist" &&
    social.playlistIndex != null &&
    social.playlistIndex >= 0 &&
    social.playlistIndex < tracks.length &&
    social.playlist.length === tracks.length
  ) {
    return social.playlistIndex;
  }

  if (social.playedPlaylistIndices.length > 0) {
    return Math.max(...social.playedPlaylistIndices);
  }

  return -1;
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
  const socialDeck: DeckId | null =
    deckA.playlistId === socialPlaylistId
      ? "A"
      : deckB.playlistId === socialPlaylistId
        ? "B"
        : null;

  if (!socialDeck) {
    return createEmptyLivePlaylistView();
  }

  return {
    deckAuthority: "social_deck",
    currentTrackId: socialDeckPlayheadTrackId(deckState, socialDeck),
    socialDeck,
    activeDeck,
    deckState,
  };
}

export function isTrackOnDeck(view: LivePlaylistView, trackId: string): boolean {
  if (
    view.deckAuthority !== "social_deck" ||
    !view.deckState ||
    !view.socialDeck
  ) {
    return false;
  }
  const deck = getDeckState(view.deckState, view.socialDeck);
  if (deck.track?.id === trackId) return true;
  if (deck.playlist.some((t) => t.id === trackId)) return true;
  if (deck.playQueue.some((t) => t.id === trackId)) return true;
  return false;
}

export function deckIndexForTrackId(
  view: LivePlaylistView,
  trackId: string
): number | null {
  if (
    view.deckAuthority !== "social_deck" ||
    !view.deckState ||
    !view.socialDeck
  ) {
    return null;
  }
  const deck = getDeckState(view.deckState, view.socialDeck);
  const index = deck.playlist.findIndex((t) => t.id === trackId);
  return index >= 0 ? index : null;
}

export function deckRowStatusForTrack(
  view: LivePlaylistView,
  trackId: string
): QueueRowStatus | null {
  if (
    view.deckAuthority !== "social_deck" ||
    !view.deckState ||
    !view.socialDeck
  ) {
    return null;
  }
  const deck = getDeckState(view.deckState, view.socialDeck);
  if (deck.track?.id === trackId) return "current";
  const index = deck.playlist.findIndex((t) => t.id === trackId);
  if (index < 0) return null;
  return playlistRowStatus(view.deckState, view.socialDeck, index);
}
