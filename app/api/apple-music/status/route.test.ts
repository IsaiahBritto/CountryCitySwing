import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getStoredAppleMusicUserTokenMock = vi.fn();

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/appleMusic/config", () => ({
  appleMusicConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/appleMusic/sessionCredentials", () => ({
  getStoredAppleMusicUserToken: getStoredAppleMusicUserTokenMock,
}));

vi.mock("@/lib/spotify/masters", () => ({
  getMasterPlaylistRefsForGenres: vi.fn(async () => []),
}));

describe("GET /api/apple-music/status", () => {
  beforeEach(() => {
    getStoredAppleMusicUserTokenMock.mockReset();
    getStoredAppleMusicUserTokenMock.mockResolvedValue(null);
  });

  it("uses stored music user token when request has no header", async () => {
    getStoredAppleMusicUserTokenMock.mockResolvedValue({
      musicUserToken: "stored-user-token",
      storefrontId: "us",
      updatedAt: new Date().toISOString(),
    });

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/apple-music/status");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasMusicUserToken).toBe(true);
    expect(body.connected).toBe(true);
    expect(body.needsAuthorization).toBe(false);
  });

  it("reports needsAuthorization when configured and no token anywhere", async () => {
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/apple-music/status");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasMusicUserToken).toBe(false);
    expect(body.needsAuthorization).toBe(true);
  });
});
