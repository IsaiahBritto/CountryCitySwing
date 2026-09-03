export type PlaybackClockState = {
  offsetMs: number;
  startedAtMs: number | null;
};

export type ComputeDisplayPositionInput = {
  offsetMs: number;
  startedAtMs: number | null;
  isPlaying: boolean;
  durationMs: number;
  nowMs: number;
};

export function createInitialClockState(): PlaybackClockState {
  return { offsetMs: 0, startedAtMs: null };
}

export function resetClock(nowMs: number): PlaybackClockState {
  return { offsetMs: 0, startedAtMs: nowMs };
}

export function pauseClock(
  state: PlaybackClockState,
  nowMs: number
): PlaybackClockState {
  if (state.startedAtMs == null) {
    return { offsetMs: state.offsetMs, startedAtMs: null };
  }
  return {
    offsetMs: state.offsetMs + Math.max(0, nowMs - state.startedAtMs),
    startedAtMs: null,
  };
}

export function resumeClock(
  state: PlaybackClockState,
  nowMs: number
): PlaybackClockState {
  return {
    offsetMs: state.offsetMs,
    startedAtMs: nowMs,
  };
}

export function syncClockFromSdk(
  state: PlaybackClockState,
  sdkPositionMs: number,
  isPlaying: boolean,
  nowMs: number
): PlaybackClockState {
  const clamped = Math.max(0, sdkPositionMs);
  if (isPlaying) {
    return { offsetMs: clamped, startedAtMs: nowMs };
  }
  return { offsetMs: clamped, startedAtMs: null };
}

export function computeDisplayPositionMs(
  input: ComputeDisplayPositionInput
): number {
  const { offsetMs, startedAtMs, isPlaying, durationMs, nowMs } = input;
  let position = offsetMs;
  if (isPlaying && startedAtMs != null) {
    position += Math.max(0, nowMs - startedAtMs);
  }
  if (durationMs > 0) {
    return Math.min(position, durationMs);
  }
  return Math.max(0, position);
}
