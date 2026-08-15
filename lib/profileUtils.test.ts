import { describe, expect, it } from "vitest";
import { profileHasCompleteName } from "@/lib/profileUtils";

describe("profileHasCompleteName", () => {
  it("returns true when both names are present", () => {
    expect(
      profileHasCompleteName({ first_name: "Alex", last_name: "Lead" })
    ).toBe(true);
  });

  it("returns false when first name is missing", () => {
    expect(profileHasCompleteName({ first_name: "", last_name: "Lead" })).toBe(
      false
    );
  });

  it("returns false when last name is missing", () => {
    expect(profileHasCompleteName({ first_name: "Alex", last_name: null })).toBe(
      false
    );
  });

  it("returns false for whitespace-only names", () => {
    expect(
      profileHasCompleteName({ first_name: "  ", last_name: "Lead" })
    ).toBe(false);
  });
});
