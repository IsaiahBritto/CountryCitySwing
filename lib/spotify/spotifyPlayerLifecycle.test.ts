import { describe, expect, it } from "vitest";
import {
  canUseWebApi,
  isTokenCacheValid,
  proactiveRefreshDelayMs,
  shouldDeferReconnect,
} from "@/lib/spotify/spotifyPlayerLifecycle";

describe("spotifyPlayerLifecycle", () => {
  it("canUseWebApi requires device id and no pending reconnect", () => {
    expect(canUseWebApi("abc", false)).toBe(true);
    expect(canUseWebApi("abc", true)).toBe(false);
    expect(canUseWebApi(null, false)).toBe(false);
  });

  it("shouldDeferReconnect when playing", () => {
    expect(shouldDeferReconnect(true)).toBe(true);
    expect(shouldDeferReconnect(false)).toBe(false);
  });

  it("isTokenCacheValid respects lead time", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    expect(isTokenCacheValid(expiresAt, now)).toBe(true);

    const soon = new Date(now + 2 * 60 * 1000).toISOString();
    expect(isTokenCacheValid(soon, now)).toBe(false);
  });

  it("proactiveRefreshDelayMs schedules before expiry", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
    const delay = proactiveRefreshDelayMs(expiresAt);
    expect(delay).toBeGreaterThanOrEqual(50 * 60 * 1000);
    expect(delay).toBeLessThanOrEqual(55 * 60 * 1000);
  });
});
