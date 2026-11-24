import { describe, expect, it } from "vitest";
import { tracksMatchForPlayback, trackUrisMatch } from "@/lib/music/trackIdentity";

describe("tracksMatchForPlayback", () => {
  it("matches identical Apple URIs", () => {
    expect(
      tracksMatchForPlayback(
        "appleMusic:songs:111",
        "appleMusic:songs:111"
      )
    ).toBe(true);
  });

  it("matches on ISRC when Apple ids differ", () => {
    expect(
      tracksMatchForPlayback(
        "appleMusic:songs:111",
        "appleMusic:songs:222",
        "USRC12345678",
        "usrc12345678"
      )
    ).toBe(true);
  });

  it("does not match different ISRCs", () => {
    expect(
      tracksMatchForPlayback(
        "appleMusic:songs:111",
        "appleMusic:songs:222",
        "USRC11111111",
        "USRC22222222"
      )
    ).toBe(false);
  });

  it("falls back to trackUrisMatch for Spotify", () => {
    expect(
      tracksMatchForPlayback(
        "spotify:track:abc",
        "spotify:track:abc"
      )
    ).toBe(true);
    expect(trackUrisMatch("spotify:track:abc", "spotify:track:abc")).toBe(true);
  });
});
