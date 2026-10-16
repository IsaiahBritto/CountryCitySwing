import { describe, expect, it, vi, beforeEach } from "vitest";
import { mirrorApplePlaylistAtSessionEnd } from "@/lib/appleMusic/mirrorPlaylistAtSessionEnd";
import { INITIAL_DJ_DECK_STATE, type DeckTrack } from "@/lib/spotify/djDeckState";
import type { DjSessionRow } from "@/lib/spotify/djSession";

const mockSync = vi.fn();
const mockGetAccess = vi.fn();
const mockGetStatus = vi.fn();

vi.mock("@/lib/appleMusic/syncLibraryPlaylistFromSnapshot", () => ({
  syncLibraryPlaylistFromSnapshot: (...args: unknown[]) => mockSync(...args),
}));

vi.mock("@/lib/music/serviceAccess", () => ({
  getMusicServiceAccess: () => mockGetAccess(),
}));

vi.mock("@/lib/spotify/activePlaylist", () => ({
  getActivePlaylistStatus: () => mockGetStatus(),
}));

function track(id: string): DeckTrack {
  return {
    id,
    uri: `appleMusic:songs:${id}`,
    name: id,
    primaryArtist: "A",
    durationMs: 60_000,
    isrc: null,
  };
}

function sessionRow(deckState: unknown): DjSessionRow {
  return {
    id: "sess-1",
    status: "ended",
    started_by: "u",
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    host_client_id: "c",
    host_device_id: null,
    host_status: "offline",
    host_last_seen_at: null,
    deck_state: deckState,
    playback_snapshot: {},
    state_version: 1,
    updated_at: new Date().toISOString(),
  };
}

describe("mirrorApplePlaylistAtSessionEnd", () => {
  beforeEach(() => {
    mockSync.mockReset();
    mockGetAccess.mockReset();
    mockGetStatus.mockReset();
    mockSync.mockResolvedValue(undefined);
  });

  it("skips when provider is not apple_music", async () => {
    mockGetAccess.mockResolvedValue({ provider: "spotify" });
    await mirrorApplePlaylistAtSessionEnd(sessionRow(INITIAL_DJ_DECK_STATE));
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("syncs played-only order for apple_music", async () => {
    mockGetAccess.mockResolvedValue({
      provider: "apple_music",
      developerToken: "dev",
      musicUserToken: "mut",
    });
    mockGetStatus.mockResolvedValue({
      appleMusicPlaylistId: "lib-pl",
      spotifyPlaylistId: null,
    });

    const deckState = {
      ...INITIAL_DJ_DECK_STATE,
      deckA: {
        ...INITIAL_DJ_DECK_STATE.deckA,
        playlistId: "lib-pl",
        playlist: [track("one"), track("two")],
        playedPlaylistIndices: [1, 0],
      },
    };

    await mirrorApplePlaylistAtSessionEnd(sessionRow(deckState));

    expect(mockSync).toHaveBeenCalledWith({
      developerToken: "dev",
      musicUserToken: "mut",
      playlistId: "lib-pl",
      orderedCatalogSongIds: ["one", "two"],
    });
  });

  it("does not throw when sync fails", async () => {
    mockGetAccess.mockResolvedValue({
      provider: "apple_music",
      developerToken: "dev",
      musicUserToken: "mut",
    });
    mockGetStatus.mockResolvedValue({
      appleMusicPlaylistId: "lib-pl",
      spotifyPlaylistId: null,
    });
    mockSync.mockRejectedValue(new Error("429"));
    const deckState = {
      ...INITIAL_DJ_DECK_STATE,
      deckA: {
        ...INITIAL_DJ_DECK_STATE.deckA,
        playlistId: "lib-pl",
        playlist: [track("one")],
        playedPlaylistIndices: [0],
      },
    };
    await expect(
      mirrorApplePlaylistAtSessionEnd(sessionRow(deckState))
    ).resolves.toBeUndefined();
  });
});
