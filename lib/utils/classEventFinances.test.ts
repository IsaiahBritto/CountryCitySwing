import { describe, expect, it } from "vitest";
import {
  computeClassEventFinances,
  validateClassPayoutTotal,
} from "./classEventFinances";

describe("computeClassEventFinances", () => {
  it("splits cash remainder to Isaiah and stripe minus venue to CCS", () => {
    const r = computeClassEventFinances({
      cashTotal: 500,
      stripeTotal: 300,
      venueCost: 400,
      payoutAmounts: [50, 75],
    });
    expect(r.payoutTotal).toBe(125);
    expect(r.isaiahPayout).toBe(375);
    expect(r.ccsElectronic).toBe(-100);
    expect(r.totalRevenue).toBe(800);
    expect(r.reconciliationDiff).toBe(0);
  });

  it("handles zero payouts", () => {
    const r = computeClassEventFinances({
      cashTotal: 200,
      stripeTotal: 100,
      venueCost: 50,
      payoutAmounts: [],
    });
    expect(r.payoutTotal).toBe(0);
    expect(r.isaiahPayout).toBe(200);
    expect(r.ccsElectronic).toBe(50);
    expect(r.reconciliationDiff).toBe(0);
  });
});

describe("validateClassPayoutTotal", () => {
  it("returns error when payouts exceed cash", () => {
    expect(validateClassPayoutTotal(600, 500)).toMatch(/exceed available cash/);
  });

  it("returns null when payouts fit cash", () => {
    expect(validateClassPayoutTotal(400, 500)).toBeNull();
  });
});
