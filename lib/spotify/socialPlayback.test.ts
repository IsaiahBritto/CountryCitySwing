import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  djDeckReducer,
  INITIAL_DJ_DECK_STATE,
  serializeDjDeckState,
} from "@/lib/spotify/djDeckState";
import { createEmptyPlaybackSnapshot } from "@/lib/spotify/djSession";

const mockGetActiveSessionRow = vi.fn();
const mockGetActivePlaylistStatus = vi.fn();
const mockLoadSnapshotTracks = vi.fn();

vi.mock("@/lib/spotify/djSessionServer", () => ({
  getActiveSessionRow: () => mockGetActiveSessionRow(),
}));

vi.mock("@/lib/spotify/activePlaylist", () => ({
  getActivePlaylistStatus: () => mockGetActivePlaylistStatus(),
  loadSnapshotTracks: () => mockLoadSnapshotTracks(),
}));

import { getSocialPlayback } from "@/lib/spotify/socialPlayback";

const SOCIAL_PLAYLIST_ID = "social-playlist-1";

const track = (id: string, name: string) => ({
  id,
  uri: `spotify:track:${id}`,
  name,
  primaryArtist: "Artist",
  durationMs: 180_000,
});

function deckWithSocialPlaylist() {
  let state = djDeckReducer(INITIAL_DJ_DECK_STATE, {
    type: "SELECT_PLAYLIST",
    deck: "A",
    playlistId: SOCIAL_PLAYLIST_ID,
    playlistName: "Tonight",
  });
  state = djDeckReducer(state, {
    type: "SET_PLAYLIST",
    deck: "A",
    playlist: [
      track("now", "Now Song"),
      track("next1", "Next One"),
      track("next2", "Next Two"),
    ],
    playlistTotalDurationMs: 540_000,
  });
  return state;
}

describe("getSocialPlayback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("labels up next from pattern when snapshot has no track id match", async () => {
    const deckState = deckWithSocialPlaylist();
    mockGetActiveSessionRow.mockResolvedValue({
      id: "sess-1",
      status: "active",
      host_status: "online",
      host_last_seen_at: new Date().toISOString(),
      deck_state: serializeDjDeckState(deckState),
      playback_snapshot: {
        ...createEmptyPlaybackSnapshot("A"),
        isPlaying: true,
        positionMs: 30_000,
      },
    });
    mockGetActivePlaylistStatus.mockResolvedValue({
      isActive: true,
      spotifyPlaylistId: SOCIAL_PLAYLIST_ID,
      pattern: ["cs", "wcs", "ld"],
      structure: { segments: [{ genre: "cs", count: 1 }, { genre: "wcs", count: 1 }, { genre: "ld", count: 1 }] },
    });
    mockLoadSnapshotTracks.mockResolvedValue([]);

    const result = await getSocialPlayback();

    expect(result.upNext).toHaveLength(2);
    expect(result.upNext[0]?.genre).toBe("wcs");
    expect(result.upNext[0]?.genreLabel).toBe("West Coast Swing");
    expect(result.upNext[1]?.genre).toBe("ld");
    expect(result.upNext[1]?.genreLabel).toBe("Line Dance");
  });

  it("prefers snapshot genre over pattern position", async () => {
    const deckState = deckWithSocialPlaylist();
    mockGetActiveSessionRow.mockResolvedValue({
      id: "sess-1",
      status: "active",
      host_status: "online",
      host_last_seen_at: new Date().toISOString(),
      deck_state: serializeDjDeckState(deckState),
      playback_snapshot: createEmptyPlaybackSnapshot("A"),
    });
    mockGetActivePlaylistStatus.mockResolvedValue({
      isActive: true,
      spotifyPlaylistId: SOCIAL_PLAYLIST_ID,
      pattern: ["cs", "wcs", "ld"],
      structure: null,
    });
    mockLoadSnapshotTracks.mockResolvedValue([
      {
        position: 1,
        spotify_track_id: "next1",
        uri: "spotify:track:next1",
        name: "Next One",
        primary_artist: "Artist",
        genre: "cs",
        source: "request",
      },
    ]);

    const result = await getSocialPlayback();

    expect(result.upNext[0]?.id).toBe("next1");
    expect(result.upNext[0]?.genre).toBe("cs");
    expect(result.upNext[0]?.genreLabel).toBe("Country Swing");
  });
});
