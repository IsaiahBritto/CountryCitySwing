export type DeckId = "A" | "B";

export type VolumeRampController = {
  cancel: () => void;
  done: Promise<void>;
};

export type CrossfadePhase = "idle" | "fadeOut" | "switchTrack" | "fadeIn";

export type CrossfadeState = {
  phase: CrossfadePhase;
  fromDeck: DeckId;
  toDeck: DeckId;
};

export type CrossfadeEvent =
  | "transitionRequested"
  | "volumeNearZero"
  | "playUriResolved"
  | "volumeAtTarget"
  | "cancel";

const RAMP_STEP_MS = 50;

export function crossfaderGain(crossfader: number, deckId: DeckId): number {
  const clamped = Math.max(0, Math.min(100, crossfader));
  if (deckId === "A") return (100 - clamped) / 100;
  return clamped / 100;
}

export function computeEffectiveVolume(input: {
  deckVolume: Record<DeckId, number>;
  masterVolume: number;
  activeDeck: DeckId;
}): number {
  const deckVol = input.deckVolume[input.activeDeck] ?? 1;
  return Math.max(0, Math.min(1, deckVol * input.masterVolume));
}

export function nextCrossfadePhase(
  state: CrossfadeState,
  event: CrossfadeEvent
): CrossfadeState {
  if (event === "cancel") {
    return { ...state, phase: "idle" };
  }

  switch (state.phase) {
    case "idle":
      if (event === "transitionRequested") {
        return { ...state, phase: "fadeOut" };
      }
      break;
    case "fadeOut":
      if (event === "volumeNearZero") {
        return { ...state, phase: "switchTrack" };
      }
      break;
    case "switchTrack":
      if (event === "playUriResolved") {
        return { ...state, phase: "fadeIn" };
      }
      break;
    case "fadeIn":
      if (event === "volumeAtTarget") {
        return { ...state, phase: "idle" };
      }
      break;
  }

  return state;
}

export function createVolumeRamp(
  setVolume: (volume: number) => void,
  from: number,
  to: number,
  durationMs: number
): VolumeRampController {
  let cancelled = false;
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const start = Date.now();
  const delta = to - from;

  const tick = () => {
    if (cancelled) {
      resolveDone();
      return;
    }
    const elapsed = Date.now() - start;
    const t = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
    const value = from + delta * t;
    setVolume(Math.max(0, Math.min(1, value)));
    if (t >= 1) {
      resolveDone();
      return;
    }
    setTimeout(tick, RAMP_STEP_MS);
  };

  tick();

  return {
    cancel: () => {
      if (!cancelled) {
        cancelled = true;
        resolveDone();
      }
    },
    done,
  };
}

export type SequentialCrossfadeDeps = {
  fadeMs: number;
  getVolume: () => number;
  setVolume: (volume: number) => void;
  onSwitch: () => void | Promise<void>;
  targetVolume: number;
};

export async function runSequentialCrossfade(
  deps: SequentialCrossfadeDeps
): Promise<void> {
  const startVolume = deps.getVolume();
  const fadeOut = createVolumeRamp(deps.setVolume, startVolume, 0, deps.fadeMs);
  await fadeOut.done;

  await deps.onSwitch();

  const fadeIn = createVolumeRamp(
    deps.setVolume,
    0,
    deps.targetVolume,
    deps.fadeMs
  );
  await fadeIn.done;
}

export const CROSSFADER_TRANSITION_THRESHOLD = 85;
export const CROSSFADER_TRANSITION_THRESHOLD_LOW = 15;

export function shouldTriggerCrossfadeTransition(
  crossfader: number,
  activeDeck: DeckId
): boolean {
  if (activeDeck === "A" && crossfader >= CROSSFADER_TRANSITION_THRESHOLD) {
    return true;
  }
  if (activeDeck === "B" && crossfader <= CROSSFADER_TRANSITION_THRESHOLD_LOW) {
    return true;
  }
  return false;
}

export function isNearTrackEnd(
  positionMs: number,
  durationMs: number,
  fadeMs: number,
  thresholdMs = 500
): boolean {
  return (
    durationMs > 0 && positionMs >= durationMs - fadeMs - thresholdMs
  );
}
