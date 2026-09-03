import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: {
    auth: {
      getSession: () => mockGetSession(),
      refreshSession: () => mockRefreshSession(),
    },
  },
}));

import { authedFetchWithRetry } from "@/lib/clientAuth";

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("authedFetchWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns response on first success", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token-a" } },
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await authedFetchWithRetry("/api/test");

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/test", {
      headers: { Authorization: "Bearer token-a" },
    });
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it("refreshes session and retries once on 401", async () => {
    mockGetSession
      .mockResolvedValueOnce({
        data: { session: { access_token: "stale-token" } },
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: "fresh-token" } },
      });
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized: Invalid token" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await authedFetchWithRetry("/api/spotify/player/play", {
      method: "POST",
      body: JSON.stringify({ uri: "spotify:track:1" }),
    });

    expect(res.status).toBe(200);
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith("/api/spotify/player/play", {
      method: "POST",
      body: JSON.stringify({ uri: "spotify:track:1" }),
      headers: {
        Authorization: "Bearer fresh-token",
        "Content-Type": "application/json",
      },
    });
  });

  it("throws when retry still returns 401", async () => {
    mockGetSession
      .mockResolvedValueOnce({
        data: { session: { access_token: "stale-token" } },
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: "still-bad" } },
      });
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(401));

    await expect(authedFetchWithRetry("/api/test")).rejects.toThrow(
      "Session expired — sign in again"
    );
  });

  it("throws when refresh yields no token", async () => {
    mockGetSession
      .mockResolvedValueOnce({
        data: { session: { access_token: "stale-token" } },
      })
      .mockResolvedValueOnce({ data: { session: null } });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401));

    await expect(authedFetchWithRetry("/api/test")).rejects.toThrow(
      "Session expired — sign in again"
    );
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
