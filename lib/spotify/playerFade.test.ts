import { describe, expect, it, vi } from "vitest";
import {
  computeEffectiveVolume,
  createVolumeRamp,
  crossfaderGain,
  isNearTrackEnd,
  nextCrossfadePhase,
  runSequentialCrossfade,
  shouldTriggerCrossfadeTransition,
} from "@/lib/spotify/playerFade";

describe("crossfaderGain", () => {
  it("returns full A at 0 and full B at 100", () => {
    expect(crossfaderGain(0, "A")).toBe(1);
    expect(crossfaderGain(0, "B")).toBe(0);
    expect(crossfaderGain(100, "A")).toBe(0);
    expect(crossfaderGain(100, "B")).toBe(1);
  });

  it("returns 0.5 at midpoint", () => {
    expect(crossfaderGain(50, "A")).toBe(0.5);
    expect(crossfaderGain(50, "B")).toBe(0.5);
  });
});

describe("computeEffectiveVolume", () => {
  it("combines deck and master volume for active deck", () => {
    const v = computeEffectiveVolume({
      deckVolume: { A: 0.8, B: 1 },
      masterVolume: 0.5,
      activeDeck: "A",
    });
    expect(v).toBeCloseTo(0.4);
  });
});

describe("createVolumeRamp", () => {
  it("reaches target volume", async () => {
    vi.useFakeTimers();
    const values: number[] = [];
    const ramp = createVolumeRamp((v) => values.push(v), 0, 1, 100);
    await vi.runAllTimersAsync();
    await ramp.done;
    expect(values.at(-1)).toBe(1);
    vi.useRealTimers();
  });

  it("cancel stops before target", async () => {
    vi.useFakeTimers();
    const values: number[] = [];
    const ramp = createVolumeRamp((v) => values.push(v), 0, 1, 500);
    await vi.advanceTimersByTimeAsync(50);
    ramp.cancel();
    await vi.runAllTimersAsync();
    await ramp.done;
    expect(values.at(-1)).toBeLessThan(1);
    vi.useRealTimers();
  });
});

describe("nextCrossfadePhase", () => {
  it("walks through transition phases", () => {
    let state = {
      phase: "idle" as const,
      fromDeck: "A" as const,
      toDeck: "B" as const,
    };
    state = nextCrossfadePhase(state, "transitionRequested");
    expect(state.phase).toBe("fadeOut");
    state = nextCrossfadePhase(state, "volumeNearZero");
    expect(state.phase).toBe("switchTrack");
    state = nextCrossfadePhase(state, "playUriResolved");
    expect(state.phase).toBe("fadeIn");
    state = nextCrossfadePhase(state, "volumeAtTarget");
    expect(state.phase).toBe("idle");
  });
});

describe("runSequentialCrossfade", () => {
  it("calls onSwitch exactly once between fades", async () => {
    vi.useFakeTimers();
    const onSwitch = vi.fn();
    const setVolume = vi.fn();
    const promise = runSequentialCrossfade({
      fadeMs: 100,
      getVolume: () => 1,
      setVolume,
      onSwitch,
      targetVolume: 0.8,
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(onSwitch).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("shouldTriggerCrossfadeTransition", () => {
  it("triggers when crossfader passes threshold toward incoming deck", () => {
    expect(shouldTriggerCrossfadeTransition(90, "A")).toBe(true);
    expect(shouldTriggerCrossfadeTransition(10, "B")).toBe(true);
    expect(shouldTriggerCrossfadeTransition(50, "A")).toBe(false);
  });
});

describe("isNearTrackEnd", () => {
  it("detects near end within fade window", () => {
    expect(isNearTrackEnd(177000, 180000, 3000)).toBe(true);
    expect(isNearTrackEnd(100000, 180000, 3000)).toBe(false);
  });
});
