import { describe, expect, it } from "vitest";
import {
  buildCommunityCompSignupConfirmationHtml,
  buildSignupSummaryFromGuestPayload,
} from "@/lib/email/communityCompSignupConfirmationEmail";

const baseSummary = {
  registrantFirstName: "Alex",
  registrantLastName: "Lead",
  registrantEmail: "alex@example.com",
  strictlySelected: true,
  strictlyRole: "lead" as const,
  jnjSelected: true,
  jnjRole: "follow" as const,
  strictlyPartnerFirstName: "Pat",
  strictlyPartnerLastName: "Follow",
  amountOwed: 45,
  paymentMethodLabel: "Venmo @host",
};

describe("buildCommunityCompSignupConfirmationHtml", () => {
  it("includes divisions and payment for registrant", () => {
    const html = buildCommunityCompSignupConfirmationHtml({
      audience: "registrant",
      event: {
        title: "Test Comp",
        starts_at: "2026-11-20T02:00:00.000Z",
        location: "Nashville",
        time_zone: "America/Chicago",
      },
      summary: baseSummary,
    });
    expect(html).toContain("Strictly:");
    expect(html).toContain("Jack &amp; Jill:");
    expect(html).toContain("Strictly partner:");
    expect(html).toContain("Pat Follow");
    expect(html).toContain("$45.00");
    expect(html).toContain("Venmo @host");
    expect(html).toContain("Pay the event organizer");
  });

  it("partner email focuses on strictly role swap", () => {
    const html = buildCommunityCompSignupConfirmationHtml({
      audience: "strictly_partner",
      event: { title: "Test Comp" },
      summary: baseSummary,
    });
    expect(html).toContain("Strictly partner");
    expect(html).toContain("Registered by:");
    expect(html).toContain("Alex Lead");
    expect(html).toContain("Strictly:");
    expect(html).toContain("Follow");
    expect(html).not.toContain("Jack &amp; Jill:");
  });
});

describe("buildSignupSummaryFromGuestPayload", () => {
  it("maps partner from resolved follow slot when registrant is lead", () => {
    const summary = buildSignupSummaryFromGuestPayload(
      {
        registrant: { first_name: "Alex", last_name: "Lead", email: "Alex@Example.com" },
        strictly_role: "lead",
        jnj_role: "follow",
      },
      {
        registrant_profile_id: null,
        strictly_lead_first_name: "Alex",
        strictly_lead_last_name: "Lead",
        strictly_lead_email: "alex@example.com",
        strictly_follow_first_name: "Pat",
        strictly_follow_last_name: "Follow",
        strictly_follow_email: "pat@example.com",
        strictly_lead_profile_id: null,
        strictly_follow_profile_id: null,
        jnj_lead_first_name: null,
        jnj_lead_last_name: null,
        jnj_lead_email: null,
        jnj_follow_first_name: "Alex",
        jnj_follow_last_name: "Lead",
        jnj_follow_email: "alex@example.com",
        jnj_lead_profile_id: null,
        jnj_follow_profile_id: null,
      },
      {
        strictlySelected: true,
        jnjSelected: false,
        amountOwed: 20,
        paymentMethodLabel: "Cash",
      }
    );
    expect(summary?.registrantEmail).toBe("alex@example.com");
    expect(summary?.strictlyPartnerFirstName).toBe("Pat");
  });
});
