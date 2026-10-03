import { describe, expect, it } from "vitest";
import {
  classifyEndpointGroup,
  isEssentialSpotifyPath,
  parseSpotifyErrorBody,
  shouldSkipPlaylistTracksFallback,
  SpotifyApiFetchError,
} from "@/lib/spotify/spotifyApiFetchError";

describe("spotifyWebApiDiagnostics", () => {
  it("parses QUOTA_EXCEEDED reason from Spotify JSON", () => {
    const parsed = parseSpotifyErrorBody(
      JSON.stringify({
        error: {
          status: 429,
          message: "Too many requests",
          reason: "QUOTA_EXCEEDED",
        },
      })
    );
    expect(parsed.reason).toBe("QUOTA_EXCEEDED");
    expect(parsed.message).toBe("Too many requests");
  });

  it("classifies playlist endpoints", () => {
    expect(classifyEndpointGroup("/me/playlists?limit=50", "GET")).toBe(
      "playlists_list"
    );
    expect(
      classifyEndpointGroup("/playlists/abc/items?limit=100", "GET")
    ).toBe("playlist_tracks");
    expect(classifyEndpointGroup("/me/player/play?device_id=x", "PUT")).toBe(
      "player"
    );
  });

  it("treats player transport as essential during quota block", () => {
    expect(isEssentialSpotifyPath("/me/player/play?device_id=x", "PUT")).toBe(
      true
    );
    expect(isEssentialSpotifyPath("/me/playlists?limit=50", "GET")).toBe(false);
  });

  it("skips playlist tracks fallback on 429", () => {
    const err = new SpotifyApiFetchError({
      message: "rate limited",
      httpStatus: 429,
      spotifyPath: "/playlists/x/items",
      method: "GET",
      errorReason: "QUOTA_EXCEEDED",
    });
    expect(shouldSkipPlaylistTracksFallback(err)).toBe(true);
  });
});
