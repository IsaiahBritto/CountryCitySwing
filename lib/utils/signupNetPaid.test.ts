import { describe, expect, it } from "vitest";
import {
  buildPrincipalRefundedMap,
  withNetPaidAmount,
} from "@/lib/utils/signupNetPaid";

describe("signupNetPaid", () => {
  it("builds principal refunded map", () => {
    const map = buildPrincipalRefundedMap(
      [
        { signup_id: "a", principal_refunded: 10 },
        { signup_id: "a", principal_refunded: 2.35 },
      ],
      "signup_id"
    );
    expect(map.get("a")).toBe(12.35);
  });

  it("computes net amount paid after partial refund", () => {
    const rows = withNetPaidAmount(
      [{ id: "1", amount_paid: 50 }],
      new Map([["1", 12.35]])
    );
    expect(rows[0].principal_refunded_total).toBe(12.35);
    expect(rows[0].net_amount_paid).toBe(37.65);
  });
});
