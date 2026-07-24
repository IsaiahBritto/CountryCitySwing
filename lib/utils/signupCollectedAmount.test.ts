import { describe, expect, it } from "vitest";
import { resolveCollectedTicketAmount } from "@/lib/utils/signupCollectedAmount";

describe("resolveCollectedTicketAmount", () => {
  it("prefers amount_paid (A1)", () => {
    expect(
      resolveCollectedTicketAmount({ amount_paid: 40, amount_owed: 30 }, 25)
    ).toBe(40);
  });

  it("falls back to amount_owed then price", () => {
    expect(resolveCollectedTicketAmount({ amount_owed: 30 }, 25)).toBe(30);
    expect(resolveCollectedTicketAmount({}, 25)).toBe(25);
  });
});
