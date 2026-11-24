import { beforeEach, describe, expect, it, vi } from "vitest";
import { MusicApiFetchError } from "@/lib/music/apiDiagnostics";

vi.mock("@/lib/appleMusic/apiFetch", () => ({
  appleMusicApiFetch: vi.fn(),
}));

import { appleMusicApiFetch } from "@/lib/appleMusic/apiFetch";
import { fetchLibraryPlaylistTracks } from "@/lib/appleMusic/client";

describe("fetchLibraryPlaylistTracks", () => {
  beforeEach(() => {
    vi.mocked(appleMusicApiFetch).mockReset();
  });

  it("returns empty tracks when Apple 404s with no tracks relationship", async () => {
    vi.mocked(appleMusicApiFetch).mockRejectedValue(
      new MusicApiFetchError({
        message: "No related resources found for tracks",
        httpStatus: 404,
        path: "/v1/me/library/playlists/p.x/tracks",
        method: "GET",
        provider: "apple_music",
      })
    );

    const result = await fetchLibraryPlaylistTracks({
      developerToken: "dev",
      musicUserToken: "user",
      playlistId: "p.x",
    });

    expect(result).toEqual({ tracks: [], totalDurationMs: 0 });
  });
});
