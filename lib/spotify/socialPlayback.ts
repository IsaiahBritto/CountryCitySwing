import {
  getActivePlaylistStatus,
  loadSnapshotTracks,
} from "@/lib/spotify/activePlaylist";
import {
  getDeckState,
  getNowPlaying,
  getUpcomingTrackEntries,
  type DeckId,
  type DeckTrack,
} from "@/lib/spotify/djDeckState";
import {
  effectiveHostStatus,
  parsePlaybackSnapshot,
  sessionDeckState,
} from "@/lib/spotify/djSession";
import { getActiveSessionRow } from "@/lib/spotify/djSessionServer";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { GENRE_LABELS } from "@/lib/spotify/requestLimits";
import { resolveTrackGenre } from "@/lib/spotify/trackGenre";

export type SocialPlaybackTrack = {
  id: string;
  name: string;
  primaryArtist: string;
  durationMs: number;
  genre: GenrePool | null;
  genreLabel: string | null;
};

export type SocialUpNextTrack = SocialPlaybackTrack;

export type SocialNowPlaying = {
  track: SocialPlaybackTrack;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  updatedAt: string;
};

export type SocialPlaybackResponse = {
  hasLiveSession: boolean;
  hostOnline: boolean;
  nowPlaying: SocialNowPlaying | null;
  upNext: SocialUpNextTrack[];
};

const UPCOMING_LIMIT = 5;

function toPlaybackTrack(
  track: DeckTrack,
  genre: GenrePool | null
): SocialPlaybackTrack {
  return {
    id: track.id,
    name: track.name,
    primaryArtist: track.primaryArtist,
    durationMs: track.durationMs,
    genre,
    genreLabel: genre ? GENRE_LABELS[genre] : null,
  };
}

function currentPlaylistIndex(
  deckId: DeckId,
  deckState: ReturnType<typeof getDeckState>
): number | null {
  if (deckState.playbackSource === "queue") return null;
  return deckState.playlistIndex;
}

function allowPositionFallbackForEntry(
  deckState: ReturnType<typeof getDeckState>,
  activeSocialPlaylistId: string | null,
  source: "queue" | "playlist"
): boolean {
  if (source === "queue") return false;
  if (!activeSocialPlaylistId || deckState.playlistId !== activeSocialPlaylistId) {
    return false;
  }
  if (deckState.shuffleEnabled) return false;
  return true;
}

function buildSnapshotMaps(rows: Awaited<ReturnType<typeof loadSnapshotTracks>>) {
  const snapshotByTrackId = new Map<string, GenrePool>();
  const snapshotByPosition = new Map<number, GenrePool>();
  for (const row of rows) {
    snapshotByTrackId.set(row.spotify_track_id, row.genre);
    snapshotByPosition.set(row.position, row.genre);
  }
  return { snapshotByTrackId, snapshotByPosition };
}

export async function getSocialPlayback(): Promise<SocialPlaybackResponse> {
  const session = await getActiveSessionRow();
  if (!session) {
    return {
      hasLiveSession: false,
      hostOnline: false,
      nowPlaying: null,
      upNext: [],
    };
  }

  const hostOnline = effectiveHostStatus(session) === "online";
  const deckState = sessionDeckState(session.deck_state);
  const snapshot = parsePlaybackSnapshot(session.playback_snapshot);
  const activeDeck = snapshot.activeDeck;
  const activeDeckState = getDeckState(deckState, activeDeck);
  const nowTrack = getNowPlaying(deckState);

  const activeStatus = await getActivePlaylistStatus();
  const pattern = activeStatus.pattern;

  let snapshotByTrackId = new Map<string, GenrePool>();
  let snapshotByPosition = new Map<number, GenrePool>();
  try {
    const rows = await loadSnapshotTracks();
    const maps = buildSnapshotMaps(rows);
    snapshotByTrackId = maps.snapshotByTrackId;
    snapshotByPosition = maps.snapshotByPosition;
  } catch (err) {
    console.warn("Could not load playlist snapshot for genres:", err);
  }

  const socialPlaylistId = activeStatus.spotifyPlaylistId;
  const positionFallbackForDeck = allowPositionFallbackForEntry(
    activeDeckState,
    socialPlaylistId,
    "playlist"
  );

  const resolveGenre = (
    track: DeckTrack,
    source: "queue" | "playlist",
    playlistIndex: number | null
  ) =>
    resolveTrackGenre({
      trackId: track.id,
      playlistIndex,
      pattern,
      snapshotByTrackId,
      snapshotByPosition,
      allowPositionFallback:
        source === "playlist"
          ? allowPositionFallbackForEntry(
              activeDeckState,
              socialPlaylistId,
              source
            )
          : false,
    });

  const upcoming = getUpcomingTrackEntries(
    deckState,
    activeDeck,
    UPCOMING_LIMIT
  ).map((entry) => {
    const genre = resolveGenre(
      entry.track,
      entry.source,
      entry.playlistIndex
    );
    return toPlaybackTrack(entry.track, genre);
  });

  if (!nowTrack) {
    return {
      hasLiveSession: true,
      hostOnline,
      nowPlaying: null,
      upNext: upcoming,
    };
  }

  const durationMs = nowTrack.durationMs > 0 ? nowTrack.durationMs : 0;
  const positionMs = Math.min(
    Math.max(0, snapshot.positionMs),
    durationMs > 0 ? durationMs : snapshot.positionMs
  );

  const nowGenre = resolveTrackGenre({
    trackId: nowTrack.id,
    playlistIndex: currentPlaylistIndex(activeDeck, activeDeckState),
    pattern,
    snapshotByTrackId,
    snapshotByPosition,
    allowPositionFallback: positionFallbackForDeck,
  });

  return {
    hasLiveSession: true,
    hostOnline,
    nowPlaying: {
      track: toPlaybackTrack(nowTrack, nowGenre),
      isPlaying: snapshot.isPlaying,
      positionMs,
      durationMs,
      updatedAt: snapshot.updatedAt,
    },
    upNext: upcoming,
  };
}
