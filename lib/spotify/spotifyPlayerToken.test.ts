import { describe, expect, it, vi } from "vitest";
import {
  fetchPlayerTokenWithRetry,
  SpotifyPlayerTokenManager,
} from "@/lib/spotify/spotifyPlayerToken";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("fetchPlayerTokenWithRetry", () => {
  it("retries up to 3 times then fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: "server down" }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchPlayerTokenWithRetry({ fetchImpl, sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it("succeeds on second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: "fail" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accessToken: "token-abc",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        })
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchPlayerTokenWithRetry({ fetchImpl, sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token.accessToken).toBe("token-abc");
    }
  });
});

describe("SpotifyPlayerTokenManager", () => {
  it("returns cached token when still valid", async () => {
    const fetchImpl = vi.fn();
    const manager = new SpotifyPlayerTokenManager({ fetchImpl });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    manager["cache"] = { accessToken: "cached", expiresAt };

    const result = await manager.getToken();
    expect(result.ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("schedules proactive refresh after successful fetch", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        accessToken: "fresh",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
    );
    const onRefreshSuccess = vi.fn();
    const manager = new SpotifyPlayerTokenManager({
      fetchImpl,
      onRefreshSuccess,
    });

    await manager.refresh();
    expect(onRefreshSuccess).toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
