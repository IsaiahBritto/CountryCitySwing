/** Min position delta before re-syncing host SDK position into the local clock. */
export const SDK_CLOCK_SYNC_THRESHOLD_MS = 400;

export type LastClockSdkSync = {
  trackUri: string | null;
  isPlaying: boolean;
  positionMs: number;
};

export function shouldSyncClockFromSdk(
  last: LastClockSdkSync | null,
  input: {
    trackUri: string | null;
    isPlaying: boolean;
    positionMs: number;
  }
): boolean {
  if (!last) return true;
  if (input.trackUri !== last.trackUri) return true;
  if (input.isPlaying !== last.isPlaying) return true;
  return (
    Math.abs(input.positionMs - last.positionMs) >= SDK_CLOCK_SYNC_THRESHOLD_MS
  );
}

export function clockStatesEqual(
  a: { offsetMs: number; startedAtMs: number | null },
  b: { offsetMs: number; startedAtMs: number | null }
): boolean {
  return a.offsetMs === b.offsetMs && a.startedAtMs === b.startedAtMs;
}

export type ClockStateSlice = {
  offsetMs: number;
  startedAtMs: number | null;
};

/** Whether syncFromSdk should trigger setState / bump (ignore startedAtMs-only churn while playing). */
export function shouldReRenderAfterClockSync(
  before: ClockStateSlice,
  next: ClockStateSlice,
  playing: boolean,
  isRunning: boolean
): boolean {
  if (playing !== isRunning) return true;
  if (
    Math.abs(before.offsetMs - next.offsetMs) >= SDK_CLOCK_SYNC_THRESHOLD_MS
  ) {
    return true;
  }
  if (!playing && before.startedAtMs !== next.startedAtMs) {
    return true;
  }
  if (!playing && before.offsetMs !== next.offsetMs) {
    return true;
  }
  return false;
}
