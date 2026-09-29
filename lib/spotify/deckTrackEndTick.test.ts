import { describe, expect, it } from "vitest";
import type { DeckTrack } from "@/lib/spotify/djDeckState";
import {
  evaluateTrackEndTick,
  resolveEffectiveEndDurationMs,
  resolvePositionForNaturalEnd,
  resolvePositionMsForEndDetection,
} from "@/lib/spotify/deckTrackEndTick";

describe("resolvePositionMsForEndDetection", () => {
  it("uses clock only when SDK URI does not match active deck track", () => {
    expect(
      resolvePositionMsForEndDetection({
        activeTrackUri: "spotify:track:new",
        sdkUri: "spotify:track:old",
        clockPositionMs: 2000,
        sdkPositionMs: 178000,
      })
    ).toBe(2000);
  });

  it("uses max of clock and SDK when URIs match", () => {
    expect(
      resolvePositionMsForEndDetection({
        activeTrackUri: "spotify:track:same",
        sdkUri: "spotify:track:same",
        clockPositionMs: 5000,
        sdkPositionMs: 6000,
      })
    ).toBe(6000);
  });
});

describe("resolveEffectiveEndDurationMs", () => {
  it("prefers deck duration when aligned even if SDK duration is longer", () => {
    expect(
      resolveEffectiveEndDurationMs({
        activeTrackUri: "spotify:track:a",
        activeDurationMs: 120000,
        sdkUri: "spotify:track:a",
        sdkDurationMs: 180000,
        endDetectionUri: "spotify:track:a",
        fallbackDurationMs: 120000,
      })
    ).toBe(120000);
  });

  it("falls back to SDK duration when deck duration is zero", () => {
    expect(
      resolveEffectiveEndDurationMs({
        activeTrackUri: "spotify:track:a",
        activeDurationMs: 0,
        sdkUri: "spotify:track:a",
        sdkDurationMs: 180000,
        endDetectionUri: "spotify:track:a",
        fallbackDurationMs: 0,
      })
    ).toBe(180000);
  });
});

describe("resolvePositionForNaturalEnd", () => {
  it("uses SDK position when SDK is on finishing track but deck advanced", () => {
    expect(
      resolvePositionForNaturalEnd({
        sdkUri: "spotify:track:old",
        activeTrackUri: "spotify:track:new",
        clockPositionMs: 0,
        sdkPositionMs: 179800,
      })
    ).toBe(179800);
  });
});

describe("evaluateTrackEndTick", () => {
  const base = {
    activeTrackUri: "spotify:track:a",
    activeDurationMs: 180000,
    clockPositionMs: 5000,
    sdkUri: "spotify:track:a",
    sdkPositionMs: 5000,
    sdkDurationMs: 180000,
    sdkIsPlaying: true,
    activeDeckTrackUri: "spotify:track:a",
    handoffInProgress: false,
    wasPlayingActiveTrack: true,
    prevActivePositionMs: 4000,
    secondDeckEnabled: false,
    handoffToOtherDeckAfterSong: false,
    crossfadeSeconds: 0,
    trackEndAlreadyTriggered: false,
    resolveTrackByUri: () => null,
  };

  it("does not near-end when stale SDK position but URI mismatch", () => {
    const result = evaluateTrackEndTick({
      ...base,
      activeTrackUri: "spotify:track:b",
      activeDeckTrackUri: "spotify:track:b",
      activeDurationMs: 180000,
      clockPositionMs: 0,
      sdkUri: "spotify:track:a",
      sdkPositionMs: 179500,
      sdkIsPlaying: true,
    });
    expect(result.fireAdvance).toBe(false);
  });

  it("fires advance near end when URIs match (deck duration)", () => {
    const result = evaluateTrackEndTick({
      ...base,
      activeDurationMs: 120000,
      sdkDurationMs: 180000,
      clockPositionMs: 119600,
      sdkPositionMs: 119600,
      sdkIsPlaying: true,
    });
    expect(result.fireAdvance).toBe(true);
    expect(result.setTrackEndTriggered).toBe(true);
  });

  it("fires advance on endedNaturally when deck duration used", () => {
    const result = evaluateTrackEndTick({
      ...base,
      activeDurationMs: 120000,
      sdkDurationMs: 180000,
      clockPositionMs: 119800,
      sdkPositionMs: 119800,
      sdkIsPlaying: false,
      wasPlayingActiveTrack: true,
      prevActivePositionMs: 119700,
    });
    expect(result.fireAdvance).toBe(true);
  });

  it("fires advance on natural end for SDK finishing track when deck advanced", () => {
    const result = evaluateTrackEndTick({
      ...base,
      activeTrackUri: "spotify:track:b",
      activeDeckTrackUri: "spotify:track:b",
      activeDurationMs: 200000,
      sdkUri: "spotify:track:a",
      sdkDurationMs: 120000,
      sdkPositionMs: 119700,
      sdkIsPlaying: false,
      wasPlayingActiveTrack: true,
      prevActivePositionMs: 119600,
      clockPositionMs: 0,
      resolveTrackByUri: (uri): DeckTrack | null =>
        uri.includes(":a")
          ? {
              id: "a",
              uri,
              name: "A",
              primaryArtist: "Artist",
              durationMs: 120000,
            }
          : null,
    });
    expect(result.fireAdvance).toBe(true);
  });

  it("clears track end guard when far from end", () => {
    const result = evaluateTrackEndTick({
      ...base,
      clockPositionMs: 30000,
      sdkPositionMs: 30000,
    });
    expect(result.clearTrackEndTriggered).toBe(true);
  });
});
