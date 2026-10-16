import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenrePool } from "@/lib/spotify/playlistIds";

const fetchPlaylistTracksWithPositions = vi.fn();
const getMasterPlaylistRefsForGenres = vi.fn();

vi.mock("@/lib/spotify/client", () => ({
  fetchPlaylistTracksWithPositions: (...args: unknown[]) =>
    fetchPlaylistTracksWithPositions(...args),
}));

vi.mock("@/lib/spotify/masters", () => ({
  getMasterPlaylistRefsForGenres: (...args: unknown[]) =>
    getMasterPlaylistRefsForGenres(...args),
}));

describe("lookupMasterGenreByIsrc", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/lib/spotify/masterIsrcGenreMap");
    mod.invalidateMasterIsrcGenreCache();
  });

  it("returns genre for normalized ISRC from master playlists", async () => {
    getMasterPlaylistRefsForGenres.mockResolvedValue([
      { genre: "cs" as GenrePool, spotifyPlaylistId: "master-cs" },
    ]);
    fetchPlaylistTracksWithPositions.mockResolvedValue([
      {
        track: {
          id: "sp-1",
          uri: "spotify:track:sp-1",
          name: "Song",
          primaryArtist: "Artist",
          durationMs: 180000,
          isrc: "USUM71901234",
        },
        position: 0,
      },
    ]);

    const { lookupMasterGenreByIsrc } = await import(
      "@/lib/spotify/masterIsrcGenreMap"
    );

    const genre = await lookupMasterGenreByIsrc(
      "usum71901234",
      "spotify-token"
    );
    expect(genre).toBe("cs");
  });

  it("returns null when ISRC is not on any master", async () => {
    getMasterPlaylistRefsForGenres.mockResolvedValue([
      { genre: "wcs" as GenrePool, spotifyPlaylistId: "master-wcs" },
    ]);
    fetchPlaylistTracksWithPositions.mockResolvedValue([]);

    const { lookupMasterGenreByIsrc } = await import(
      "@/lib/spotify/masterIsrcGenreMap"
    );

    const genre = await lookupMasterGenreByIsrc("USUNKNOWN", "spotify-token");
    expect(genre).toBeNull();
  });
});
