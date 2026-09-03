import { describe, expect, it } from "vitest";
import { trackUrisMatch } from "@/lib/spotify/trackUri";

describe("trackUrisMatch", () => {
  it("matches identical URIs", () => {
    expect(
      trackUrisMatch("spotify:track:abc123", "spotify:track:abc123")
    ).toBe(true);
  });

  it("matches SDK and queue URI formats for the same track", () => {
    expect(
      trackUrisMatch(
        "spotify:track:abc123",
        "https://open.spotify.com/track/abc123"
      )
    ).toBe(true);
  });

  it("returns false for different tracks", () => {
    expect(
      trackUrisMatch("spotify:track:abc123", "spotify:track:xyz789")
    ).toBe(false);
  });
});
