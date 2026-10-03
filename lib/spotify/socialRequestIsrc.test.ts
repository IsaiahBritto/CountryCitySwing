import { describe, expect, it, vi } from "vitest";
import type { SpotifyTrack } from "@/lib/spotify/client";

vi.mock("@/lib/spotify/client", () => ({
  fetchTrackIsrc: vi.fn(),
  fetchPlaylistTracksWithPositions: vi.fn(),
}));

vi.mock("@/lib/spotify/masters", () => ({
  getMasterPlaylistRefsForGenres: vi.fn(),
}));

import { fetchTrackIsrc } from "@/lib/spotify/client";
import { resolveCanonicalSocialRequestFromMaster } from "@/lib/spotify/socialRequestIsrc";

function track(id: string, isrc: string): SpotifyTrack {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `Name ${id}`,
    primaryArtist: "Artist",
    durationMs: 180000,
    isrc,
  };
}

describe("resolveCanonicalSocialRequestFromMaster", () => {
  it("uses the master playlist copy when ISRC matches a different edition", async () => {
    vi.mocked(fetchTrackIsrc).mockResolvedValue("USRC123");

    const request = {
      trackId: "clicked",
      uri: "spotify:track:clicked",
      name: "Clicked title",
      primaryArtist: "Clicked artist",
      genre: "cs" as const,
    };

    const resolved = await resolveCanonicalSocialRequestFromMaster({
      request,
      masterGenre: "cs",
      accessToken: "token",
      masterPlaylistItems: [
        { track: track("master-copy", "USRC123"), position: 0 },
      ],
    });

    expect(resolved.trackId).toBe("master-copy");
    expect(resolved.uri).toBe("spotify:track:master-copy");
    expect(resolved.name).toBe("Name master-copy");
    expect(resolved.genre).toBe("cs");
  });

  it("returns the request unchanged when ISRC is not on the master", async () => {
    vi.mocked(fetchTrackIsrc).mockResolvedValue("USRC999");

    const request = {
      trackId: "clicked",
      uri: "spotify:track:clicked",
      name: "Clicked",
      primaryArtist: "Artist",
      genre: "wcs" as const,
    };

    const resolved = await resolveCanonicalSocialRequestFromMaster({
      request,
      masterGenre: "wcs",
      accessToken: "token",
      masterPlaylistItems: [{ track: track("other", "USRC111"), position: 0 }],
    });

    expect(resolved).toEqual(request);
  });
});
