import {
  getDeckState,
  type DeckId,
  type DeckTrack,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";

function resolveSocialDeckId(
  deckState: DjDeckState,
  socialPlaylistId: string
): DeckId | null {
  const id = socialPlaylistId.trim();
  if (!id) return null;
  if (getDeckState(deckState, "A").playlistId === id) return "A";
  if (getDeckState(deckState, "B").playlistId === id) return "B";
  return null;
}

function catalogIdFromTrack(track: DeckTrack | undefined): string | null {
  const id = track?.id?.trim();
  return id || null;
}

/**
 * Ordered Apple catalog song ids for end-of-session library mirror:
 * played playlist rows only, ascending playlist index (plus current row if mid-song).
 */
export function buildEndOfSessionPlaylistOrder(
  deckState: DjDeckState,
  socialPlaylistId: string
): string[] {
  const deckId = resolveSocialDeckId(deckState, socialPlaylistId);
  if (!deckId) return [];

  const deck = getDeckState(deckState, deckId);
  if (deck.playlist.length === 0) return [];

  const indices = [...deck.playedPlaylistIndices]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < deck.playlist.length)
    .sort((a, b) => a - b);

  if (
    deck.playlistIndex != null &&
    deck.track &&
    deck.playlistIndex >= 0 &&
    deck.playlistIndex < deck.playlist.length &&
    !indices.includes(deck.playlistIndex)
  ) {
    indices.push(deck.playlistIndex);
  }

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const index of indices) {
    const catalogId = catalogIdFromTrack(deck.playlist[index]);
    if (!catalogId || seen.has(catalogId)) continue;
    seen.add(catalogId);
    ordered.push(catalogId);
  }
  return ordered;
}
