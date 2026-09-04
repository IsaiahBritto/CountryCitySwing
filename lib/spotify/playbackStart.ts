import { isNearTrackEnd } from "@/lib/spotify/playerFade";

const DEFAULT_MATERIAL_AHEAD_MS = 1000;

export function shouldRestartFromBeginning(
  requestedPositionMs: number,
  sdkPositionMs: number,
  durationMs: number,
  materialAheadMs = DEFAULT_MATERIAL_AHEAD_MS
): boolean {
  if (requestedPositionMs > 0) return false;
  if (sdkPositionMs > materialAheadMs) return true;
  if (
    durationMs > 0 &&
    isNearTrackEnd(sdkPositionMs, durationMs, 0)
  ) {
    return true;
  }
  return false;
}
