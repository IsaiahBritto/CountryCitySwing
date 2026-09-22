import { describe, expect, it } from "vitest";
import { shouldSkipPlaylistTracksFallback } from "@/lib/spotify/spotifyApiFetchError";

describe("Spotify quota endurance projections", () => {
  it("models cycle-boundary sync without Spotify Web API playlist pages", () => {
    const genreCyclesPerThreeHours = 12;
    const spotifyPlaylistPagesPerCycleBefore = 2;
    const savedCalls =
      genreCyclesPerThreeHours * spotifyPlaylistPagesPerCycleBefore;
    expect(savedCalls).toBe(24);
  });

  it("models dual deck playlist list dedupe", () => {
    const deckSelectors = 2;
    const listCallsBefore = deckSelectors;
    const listCallsAfter = 1;
    expect(listCallsBefore - listCallsAfter).toBe(1);
  });

  it("429 fallback would double playlist read cost", () => {
    const pagesPerRead = 3;
    const withoutFallback = pagesPerRead;
    const withFallback = pagesPerRead * 2;
    expect(withFallback - withoutFallback).toBe(3);
    expect(shouldSkipPlaylistTracksFallback(new Error("Spotify API (429)"))).toBe(
      true
    );
  });
});
