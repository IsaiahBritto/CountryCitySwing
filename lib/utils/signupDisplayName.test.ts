import { describe, expect, it } from "vitest";
import {
  formatCompSignupLabel,
  formatSocialSignupLabel,
} from "@/lib/utils/signupDisplayName";

describe("formatSocialSignupLabel", () => {
  it("joins first and last name", () => {
    expect(
      formatSocialSignupLabel({ first_name: "Alex", last_name: "Lead" })
    ).toBe("Alex Lead");
  });

  it("falls back to email when name is missing", () => {
    expect(
      formatSocialSignupLabel({
        first_name: "",
        last_name: null,
        email: "alex@example.com",
      })
    ).toBe("alex@example.com");
  });

  it("falls back to unknown registrant", () => {
    expect(formatSocialSignupLabel({})).toBe("Unknown registrant");
  });
});

describe("formatCompSignupLabel", () => {
  it("joins strictly lead and follow", () => {
    expect(
      formatCompSignupLabel({
        strictly_lead_first_name: "Sam",
        strictly_lead_last_name: "L",
        strictly_follow_first_name: "Fran",
        strictly_follow_last_name: "F",
      })
    ).toBe("Sam L / Fran F");
  });

  it("falls back to email", () => {
    expect(
      formatCompSignupLabel({
        jnj_lead_email: "jill@example.com",
      })
    ).toBe("jill@example.com");
  });

  it("falls back to comp registration", () => {
    expect(formatCompSignupLabel({})).toBe("Comp registration");
  });
});
