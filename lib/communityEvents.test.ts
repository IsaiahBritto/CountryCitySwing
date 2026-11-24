import { describe, expect, it } from "vitest";
import {
  canOrganizerEditStatus,
  communityEventSubmitRequirements,
  isApprovedCommunityEvent,
  isPublicCcsHomepageEvent,
  parseCommunityPaymentMethods,
  validateCommunityEventSubmit,
  validateCommunityLevels,
} from "@/lib/communityEvents";

describe("communityEvents", () => {
  it("parses payment methods", () => {
    expect(parseCommunityPaymentMethods([{ id: "a", label: "Cash" }])).toEqual([
      { id: "a", label: "Cash" },
    ]);
    expect(parseCommunityPaymentMethods([{ id: "", label: "x" }])).toEqual([]);
  });

  it("detects approved community events", () => {
    expect(
      isApprovedCommunityEvent({ host_kind: "community", approval_status: "approved" })
    ).toBe(true);
    expect(
      isApprovedCommunityEvent({ host_kind: "community", approval_status: "pending" })
    ).toBe(false);
  });

  it("homepage excludes community", () => {
    expect(isPublicCcsHomepageEvent({ host_kind: "ccs" })).toBe(true);
    expect(isPublicCcsHomepageEvent({ host_kind: "community" })).toBe(false);
  });

  it("blocks TN State levels", () => {
    expect(validateCommunityLevels("TN State", null)).toMatch(/not allowed/);
  });

  it("validates submit requirements", () => {
    expect(
      validateCommunityEventSubmit({
        title: "Test",
        starts_at: "2026-01-01T12:00:00.000Z",
        location: "Hall",
        community_payment_methods: [{ id: "1", label: "Venmo" }],
        competitions: [{ id: "c1" }],
      })
    ).toBeNull();
    const reqs = communityEventSubmitRequirements({ title: "" });
    expect(reqs.find((r) => r.id === "title")?.met).toBe(false);
  });

  it("allows organizers to edit in every approval status", () => {
    expect(canOrganizerEditStatus("draft")).toBe(true);
    expect(canOrganizerEditStatus("pending")).toBe(true);
    expect(canOrganizerEditStatus("approved")).toBe(true);
    expect(canOrganizerEditStatus("rejected")).toBe(true);
  });
});
