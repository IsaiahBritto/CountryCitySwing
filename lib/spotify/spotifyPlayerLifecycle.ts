/** Whether Web API play/pause/seek can target a device safely. */
export function canUseWebApi(
  deviceId: string | null | undefined,
  pendingReconnect: boolean
): boolean {
  return Boolean(deviceId?.trim()) && !pendingReconnect;
}

/** Whether device reconnect should wait until playback stops. */
export function shouldDeferReconnect(isPlaying: boolean): boolean {
  return isPlaying;
}

/** Milliseconds before token expiry to trigger proactive refresh (5 min). */
export const PROACTIVE_REFRESH_LEAD_MS = 5 * 60 * 1000;

/** Fallback proactive refresh interval when expiresAt is unknown (50 min). */
export const PROACTIVE_REFRESH_FALLBACK_MS = 50 * 60 * 1000;

/** Retry backoff delays for token fetch (ms). */
export const TOKEN_FETCH_BACKOFF_MS = [0, 2000, 5000] as const;

export function proactiveRefreshDelayMs(expiresAt: string | null): number {
  if (!expiresAt) return PROACTIVE_REFRESH_FALLBACK_MS;
  const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
  const delay = msUntilExpiry - PROACTIVE_REFRESH_LEAD_MS;
  if (delay <= 0) return 0;
  return Math.min(delay, PROACTIVE_REFRESH_FALLBACK_MS);
}

export function isTokenCacheValid(
  expiresAt: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - nowMs > PROACTIVE_REFRESH_LEAD_MS;
}
