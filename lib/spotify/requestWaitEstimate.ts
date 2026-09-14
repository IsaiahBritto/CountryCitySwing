import {
  getNowPlaying,
  getUpcomingTracks,
  type DeckTrack,
} from "@/lib/spotify/djDeckState";
import {
  effectiveHostStatus,
  parsePlaybackSnapshot,
  sessionDeckState,
  type DjPlaybackSnapshot,
} from "@/lib/spotify/djSession";
import type { DjSessionRow } from "@/lib/spotify/djSession";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { GENRE_LABELS } from "@/lib/spotify/requestLimits";

export type RequestQueueStatus =
  | "now_playing"
  | "queued"
  | "played"
  | "unknown";

export type UserRequestRow = {
  id: number;
  spotify_track_id: string;
  name: string;
  primary_artist: string;
  genre: GenrePool;
  result: "replaced" | "appended" | "rejected";
  position: number | null;
  created_at: string;
};

export type UserRequestWithEstimate = {
  id: number;
  trackId: string;
  name: string;
  primaryArtist: string;
  genre: GenrePool;
  genreLabel: string;
  position: number | null;
  result: "replaced" | "appended" | "rejected";
  status: RequestQueueStatus;
  estimatedWaitMs: number | null;
  createdAt: string;
};

function buildPlaybackStream(
  currentTrack: DeckTrack | null,
  upcoming: DeckTrack[]
): DeckTrack[] {
  if (!currentTrack) return upcoming;
  return [currentTrack, ...upcoming];
}

export function estimateWaitForTrack(
  trackId: string,
  stream: DeckTrack[],
  playback: DjPlaybackSnapshot | null
): { status: RequestQueueStatus; estimatedWaitMs: number | null } {
  if (stream.length === 0) {
    return { status: "unknown", estimatedWaitMs: null };
  }

  const index = stream.findIndex((t) => t.id === trackId);
  if (index < 0) {
    return { status: "unknown", estimatedWaitMs: null };
  }

  if (index === 0) {
    return { status: "now_playing", estimatedWaitMs: 0 };
  }

  let waitMs = 0;
  for (let i = 0; i < index; i++) {
    const t = stream[i];
    if (!t) continue;
    if (i === 0 && playback) {
      const duration = t.durationMs > 0 ? t.durationMs : 0;
      const remaining = Math.max(0, duration - Math.max(0, playback.positionMs));
      waitMs += remaining;
    } else {
      waitMs += t.durationMs > 0 ? t.durationMs : 0;
    }
  }

  return { status: "queued", estimatedWaitMs: waitMs };
}

export function enrichRequestsWithEstimates(
  requests: UserRequestRow[],
  session: DjSessionRow | null
): UserRequestWithEstimate[] {
  let stream: DeckTrack[] = [];
  let playback: DjPlaybackSnapshot | null = null;
  const hostOnline =
    session != null && effectiveHostStatus(session) === "online";

  if (session && hostOnline) {
    const deckState = sessionDeckState(session.deck_state);
    playback = parsePlaybackSnapshot(session.playback_snapshot);
    const current = getNowPlaying(deckState);
    const upcoming = getUpcomingTracks(
      deckState,
      playback.activeDeck,
      200
    );
    stream = buildPlaybackStream(current, upcoming);
  }

  const currentId = stream[0]?.id ?? null;
  const upcomingIds = new Set(stream.slice(1).map((t) => t.id));

  return requests.map((row) => {
    const genre = row.genre;
    let status: RequestQueueStatus = "unknown";
    let estimatedWaitMs: number | null = null;

    if (hostOnline && stream.length > 0) {
      if (row.spotify_track_id === currentId) {
        status = "now_playing";
        estimatedWaitMs = 0;
      } else if (upcomingIds.has(row.spotify_track_id)) {
        const estimate = estimateWaitForTrack(
          row.spotify_track_id,
          stream,
          playback
        );
        status = estimate.status;
        estimatedWaitMs = estimate.estimatedWaitMs;
      } else {
        status = "played";
        estimatedWaitMs = null;
      }
    }

    return {
      id: row.id,
      trackId: row.spotify_track_id,
      name: row.name,
      primaryArtist: row.primary_artist,
      genre,
      genreLabel: GENRE_LABELS[genre] ?? genre,
      position: row.position,
      result: row.result,
      status,
      estimatedWaitMs,
      createdAt: row.created_at,
    };
  });
}

export function formatEstimatedWait(ms: number | null): string {
  if (ms == null) return "Estimate unavailable";
  if (ms <= 0) return "Playing now";
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 1) return "Less than a minute";
  if (totalMinutes === 1) return "~1 min";
  return `~${totalMinutes} min`;
}
