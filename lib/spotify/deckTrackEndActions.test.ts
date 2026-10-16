import { describe, expect, it } from "vitest";
import {
  trackEndActionFromPlaybackCompleted,
  trackEndActionFromTick,
} from "@/lib/spotify/deckTrackEndActions";

describe("trackEndActionFromTick", () => {
  it("prefers handoff over advance", () => {
    expect(
      trackEndActionFromTick({ fireHandoff: true, fireAdvance: true })
    ).toBe("handoff");
  });

  it("returns advance when only advance fires", () => {
    expect(
      trackEndActionFromTick({ fireHandoff: false, fireAdvance: true })
    ).toBe("advance");
  });
});

describe("trackEndActionFromPlaybackCompleted", () => {
  it("returns handoff when enabled", () => {
    expect(
      trackEndActionFromPlaybackCompleted({
        secondDeckEnabled: true,
        handoffToOtherDeckAfterSong: true,
      })
    ).toBe("handoff");
  });

  it("returns advance when handoff off", () => {
    expect(
      trackEndActionFromPlaybackCompleted({
        secondDeckEnabled: true,
        handoffToOtherDeckAfterSong: false,
      })
    ).toBe("advance");
  });
});
