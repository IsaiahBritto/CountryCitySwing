import { describe, expect, it } from "vitest";
import {
  collectCompSignupRecipients,
  collectSignupRecipients,
} from "@/lib/registrationBroadcastRecipients";

describe("collectSignupRecipients", () => {
  it("includes active signups and dedupes emails", () => {
    const recipients = collectSignupRecipients(
      [
        {
          id: "1",
          first_name: "Ada",
          last_name: "Lovelace",
          email: "Ada@example.com",
          paid: true,
        },
        {
          id: "2",
          first_name: "Ada",
          last_name: "Dup",
          email: "ada@example.com",
          paid: false,
        },
      ],
      "all"
    );
    expect(recipients).toHaveLength(1);
    expect(recipients[0].email).toBe("ada@example.com");
  });

  it("filters unpaid audience", () => {
    const recipients = collectSignupRecipients(
      [
        {
          id: "1",
          first_name: "Paid",
          last_name: "User",
          email: "paid@example.com",
          paid: true,
        },
        {
          id: "2",
          first_name: "Unpaid",
          last_name: "User",
          email: "unpaid@example.com",
          paid: false,
        },
      ],
      "unpaid"
    );
    expect(recipients).toHaveLength(1);
    expect(recipients[0].email).toBe("unpaid@example.com");
  });

  it("excludes cancelled signups", () => {
    const recipients = collectSignupRecipients(
      [
        {
          id: "1",
          first_name: "Cancel",
          last_name: "Me",
          email: "cancel@example.com",
          paid: false,
          refunded_or_cancelled: "cancelled",
        },
      ],
      "all"
    );
    expect(recipients).toHaveLength(0);
  });
});

describe("collectCompSignupRecipients", () => {
  it("collects unique emails from comp roles", () => {
    const recipients = collectCompSignupRecipients(
      [
        {
          id: "c1",
          paid: false,
          strictly_lead_email: "lead@example.com",
          strictly_lead_first_name: "Lead",
          strictly_lead_last_name: "One",
          strictly_follow_email: "follow@example.com",
          strictly_follow_first_name: "Follow",
          strictly_follow_last_name: "Two",
        },
      ],
      "unpaid"
    );
    expect(recipients.map((r) => r.email).sort()).toEqual([
      "follow@example.com",
      "lead@example.com",
    ]);
  });
});
