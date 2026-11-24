import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireAuthenticatedProfileMock = vi.fn();
const loadOrganizedEventsForUserMock = vi.fn();
const loadCcsSiteAdminDisplayNamesMock = vi.fn();

vi.mock("@/lib/nonCcsEventAuth", () => ({
  requireAuthenticatedProfile: (...args: unknown[]) =>
    requireAuthenticatedProfileMock(...args),
  isSiteAdmin: (role: string | null | undefined) =>
    (role ?? "").toLowerCase() === "admin",
}));

vi.mock("@/lib/compEventAccess", () => ({
  loadOrganizedEventsForUser: (...args: unknown[]) =>
    loadOrganizedEventsForUserMock(...args),
}));

vi.mock("@/lib/ccsSiteAdmins", () => ({
  loadCcsSiteAdminDisplayNames: () => loadCcsSiteAdminDisplayNamesMock(),
}));

describe("GET /api/non-ccs-events/ccs-admins", () => {
  beforeEach(() => {
    requireAuthenticatedProfileMock.mockReset();
    loadOrganizedEventsForUserMock.mockReset();
    loadCcsSiteAdminDisplayNamesMock.mockReset();
    loadCcsSiteAdminDisplayNamesMock.mockResolvedValue([
      { id: "a1", displayName: "Alex Admin" },
    ]);
  });

  it("returns 401 when not authenticated", async () => {
    requireAuthenticatedProfileMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      }),
    });

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/non-ccs-events/ccs-admins");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when attendee has no hosted events", async () => {
    requireAuthenticatedProfileMock.mockResolvedValue({
      ok: true,
      userId: "u1",
      role: "attendee",
    });
    loadOrganizedEventsForUserMock.mockResolvedValue([]);

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/non-ccs-events/ccs-admins", {
      headers: { Authorization: "Bearer token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns admin list for organizers", async () => {
    requireAuthenticatedProfileMock.mockResolvedValue({
      ok: true,
      userId: "o1",
      role: "attendee",
    });
    loadOrganizedEventsForUserMock.mockResolvedValue([
      { id: "e1", title: "Host", starts_at: "2026-01-01", approval_status: "draft" },
    ]);

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/non-ccs-events/ccs-admins", {
      headers: { Authorization: "Bearer token" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ccs_site_admins).toEqual([{ id: "a1", displayName: "Alex Admin" }]);
    expect(loadOrganizedEventsForUserMock).toHaveBeenCalledWith("o1");
  });

  it("returns admin list for site admins without organizer check", async () => {
    requireAuthenticatedProfileMock.mockResolvedValue({
      ok: true,
      userId: "a1",
      role: "admin",
    });

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/non-ccs-events/ccs-admins", {
      headers: { Authorization: "Bearer token" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ccs_site_admins).toHaveLength(1);
    expect(loadOrganizedEventsForUserMock).not.toHaveBeenCalled();
  });
});
