import { describe, expect, it } from "vitest";
import {
  shouldAttemptHandoffAtEnd,
  shouldSkipTrackEndAutomation,
  shouldTriggerNormalTrackEnd,
} from "@/lib/spotify/deckTrackEnd";

describe("shouldSkipTrackEndAutomation", () => {
  it("skips while handoff is in progress", () => {
    expect(
      shouldSkipTrackEndAutomation({
        sdkUri: "spotify:track:a",
        activeDeckTrackUri: "spotify:track:b",
        handoffInProgress: true,
      })
    ).toBe(true);
  });

  it("skips when SDK URI does not match active deck track", () => {
    expect(
      shouldSkipTrackEndAutomation({
        sdkUri: "spotify:track:finishedOnA",
        activeDeckTrackUri: "spotify:track:deckBTrack",
        handoffInProgress: false,
      })
    ).toBe(true);
  });

  it("does not skip when SDK matches active deck", () => {
    expect(
      shouldSkipTrackEndAutomation({
        sdkUri: "spotify:track:same",
        activeDeckTrackUri: "spotify:track:same",
        handoffInProgress: false,
      })
    ).toBe(false);
  });
});

describe("shouldAttemptHandoffAtEnd", () => {
  it("requires handoff enabled and natural end", () => {
    expect(
      shouldAttemptHandoffAtEnd({
        handoffEnabled: true,
        endedNaturally: true,
      })
    ).toBe(true);
    expect(
      shouldAttemptHandoffAtEnd({
        handoffEnabled: true,
        endedNaturally: false,
      })
    ).toBe(false);
    expect(
      shouldAttemptHandoffAtEnd({
        handoffEnabled: false,
        endedNaturally: true,
      })
    ).toBe(false);
  });
});

describe("shouldTriggerNormalTrackEnd", () => {
  it("uses near-end and natural end when handoff is off", () => {
    expect(
      shouldTriggerNormalTrackEnd({
        handoffEnabled: false,
        nearEndWhilePlaying: true,
        endedNaturally: false,
      })
    ).toBe(true);
    expect(
      shouldTriggerNormalTrackEnd({
        handoffEnabled: false,
        nearEndWhilePlaying: false,
        endedNaturally: true,
      })
    ).toBe(true);
  });

  it("does not auto-advance on near-end when handoff is on", () => {
    expect(
      shouldTriggerNormalTrackEnd({
        handoffEnabled: true,
        nearEndWhilePlaying: true,
        endedNaturally: false,
      })
    ).toBe(false);
  });
});
