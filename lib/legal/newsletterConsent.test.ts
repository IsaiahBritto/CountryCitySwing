import { describe, expect, it } from "vitest";
import { newsletterProfileUpdateFields } from "./newsletterConsent";

describe("newsletterProfileUpdateFields", () => {
  it("records consent when opting in", () => {
    const fields = newsletterProfileUpdateFields({
      optIn: true,
      source: "event_signup",
      ip: "203.0.113.1",
    });
    expect(fields.newsletter_opt_in).toBe(true);
    expect(fields.newsletter_consent_source).toBe("event_signup");
    expect(fields.newsletter_consent_ip).toBe("203.0.113.1");
    expect(fields.newsletter_consent_at).toBeTruthy();
    expect(fields.newsletter_opt_out_at).toBeNull();
  });

  it("records opt-out timestamp when opting out", () => {
    const fields = newsletterProfileUpdateFields({ optIn: false });
    expect(fields.newsletter_opt_in).toBe(false);
    expect(fields.newsletter_opt_out_at).toBeTruthy();
  });
});
