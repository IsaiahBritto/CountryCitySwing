import { describe, it, expect } from "vitest";
import { deleteEligibilityFromChecks } from "@/lib/nonCcsEventDeleteEligibility";

describe("deleteEligibilityFromChecks", () => {
  it("allows delete when no signups and no published results", () => {
    const r = deleteEligibilityFromChecks({
      signupCount: 0,
      hasPublishedResults: false,
    });
    expect(r.canDelete).toBe(true);
    expect(r.deleteBlockReason).toBeNull();
  });

  it("blocks when non-test signups exist", () => {
    const r = deleteEligibilityFromChecks({
      signupCount: 3,
      hasPublishedResults: false,
      hasNonTestRegistrants: true,
    });
    expect(r.canDelete).toBe(false);
    expect(r.deleteBlockReason).toMatch(/registered/i);
  });

  it("allows delete when only test signups exist", () => {
    const r = deleteEligibilityFromChecks({
      signupCount: 3,
      hasPublishedResults: false,
      hasNonTestRegistrants: false,
    });
    expect(r.canDelete).toBe(true);
  });

  it("blocks when published results exist", () => {
    const r = deleteEligibilityFromChecks({
      signupCount: 0,
      hasPublishedResults: true,
    });
    expect(r.canDelete).toBe(false);
    expect(r.deleteBlockReason).toMatch(/published/i);
  });

  it("published results take precedence over signups in messaging", () => {
    const r = deleteEligibilityFromChecks({
      signupCount: 5,
      hasPublishedResults: true,
    });
    expect(r.canDelete).toBe(false);
    expect(r.deleteBlockReason).toMatch(/published/i);
  });
});