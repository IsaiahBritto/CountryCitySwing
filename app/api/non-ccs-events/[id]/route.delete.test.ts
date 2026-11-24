import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireAuthenticatedProfileMock = vi.fn();
const loadCommunityEventForOrganizerMock = vi.fn();
const communityEventDeleteEligibilityMock = vi.fn();
const deleteEventFullyMock = vi.fn();

vi.mock("@/lib/nonCcsEventAuth", () => ({
  requireAuthenticatedProfile: (...args: unknown[]) =>
    requireAuthenticatedProfileMock(...args),
  isSiteAdmin: (role: string | null | undefined) =>
    (role ?? "").toLowerCase() === "admin",
  adminEditingOthersForbiddenResponse: () => null,
}));

vi.mock("@/lib/nonCcsEventService", () => ({
  buildCommunityEventResultsSummary: vi.fn(),
  buildCommunityEventUpdate: vi.fn(),
  canOrganizerEditStatus: () => true,
  loadCommunityEventForOrganizer: (...args: unknown[]) =>
    loadCommunityEventForOrganizerMock(...args),
  publicTabForCommunityEvent: vi.fn(),
  publicSlugForCommunityEventId: vi.fn(),
  resolvePublicCommunityEventRouteKey: vi.fn(),
  validateSubmitPayload: vi.fn(),
}));

vi.mock("@/lib/nonCcsEventDelete", () => ({
  communityEventDeleteEligibility: (...args: unknown[]) =>
    communityEventDeleteEligibilityMock(...args),
}));

vi.mock("@/lib/events/deleteEvent", () => ({
  deleteEventFully: (...args: unknown[]) => deleteEventFullyMock(...args),
}));

vi.mock("@/lib/supabaseServer", () => ({
  supabaseServer: { from: vi.fn() },
}));

describe("DELETE /api/non-ccs-events/[id]", () => {
  beforeEach(() => {
    requireAuthenticatedProfileMock.mockReset();
    loadCommunityEventForOrganizerMock.mockReset();
    communityEventDeleteEligibilityMock.mockReset();
    deleteEventFullyMock.mockReset();
  });

  it("returns 409 when delete is blocked", async () => {
    requireAuthenticatedProfileMock.mockResolvedValue({
      ok: true,
      userId: "u1",
      role: "attendee",
    });
    loadCommunityEventForOrganizerMock.mockResolvedValue({
      id: "ev1",
      organizer_profile_id: "u1",
      approval_status: "approved",
    });
    communityEventDeleteEligibilityMock.mockResolvedValue({
      canDelete: false,
      deleteBlockReason: "This event cannot be deleted after dancers have registered.",
    });

    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/non-ccs-events/ev1", {
      method: "DELETE",
      headers: { Authorization: "Bearer token" },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "ev1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/registered/i);
    expect(deleteEventFullyMock).not.toHaveBeenCalled();
  });

  it("deletes when eligible", async () => {
    requireAuthenticatedProfileMock.mockResolvedValue({
      ok: true,
      userId: "u1",
      role: "attendee",
    });
    loadCommunityEventForOrganizerMock.mockResolvedValue({
      id: "ev1",
      organizer_profile_id: "u1",
      approval_status: "draft",
    });
    communityEventDeleteEligibilityMock.mockResolvedValue({
      canDelete: true,
      deleteBlockReason: null,
    });
    deleteEventFullyMock.mockResolvedValue(undefined);

    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/non-ccs-events/ev1", {
      method: "DELETE",
      headers: { Authorization: "Bearer token" },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "ev1" }) });
    expect(res.status).toBe(200);
    expect(deleteEventFullyMock).toHaveBeenCalledWith("ev1");
  });
});