import { describe, expect, it } from "vitest";
import {
  computeSocialDoorPayouts,
  defaultDoorPayoutForEventType,
  isSocialDoorPayoutModel,
  normalizeDoorPayouts,
  SOCIAL_DOOR_PAYOUT_CUTOFF_YMD,
  SOCIAL_EVENT_DOOR_PAYOUT,
} from "@/lib/socialFinancesConstants";

describe("isSocialDoorPayoutModel", () => {
  it("uses cutoff date in event TZ", () => {
    expect(isSocialDoorPayoutModel("2026-07-16T20:00:00-05:00", "America/Chicago")).toBe(false);
    expect(isSocialDoorPayoutModel("2026-07-17T20:00:00-05:00", "America/Chicago")).toBe(true);
    expect(SOCIAL_DOOR_PAYOUT_CUTOFF_YMD).toBe("2026-07-17");
  });
});

describe("defaultDoorPayoutForEventType", () => {
  it("returns 20 for social events and 10 otherwise", () => {
    expect(defaultDoorPayoutForEventType("social")).toBe(SOCIAL_EVENT_DOOR_PAYOUT);
    expect(defaultDoorPayoutForEventType("Social")).toBe(20);
    expect(defaultDoorPayoutForEventType("workshop")).toBe(10);
    expect(defaultDoorPayoutForEventType(null)).toBe(10);
  });
});

describe("computeSocialDoorPayouts", () => {
  it("pays doors from cash and remainder to Isaiah; electronic after venue+other to CCS", () => {
    const doors = normalizeDoorPayouts([
      { slot_id: "a", name: "Alex", amount: 10 },
      { slot_id: "b", name: "Blake", amount: 10 },
    ]);
    const r = computeSocialDoorPayouts({
      cashTotal: 100,
      stripeTotal: 800,
      venueCost: 750,
      otherExpense: 20,
      doorRows: doors,
    });
    expect(r.doorTotal).toBe(20);
    expect(r.isaiahCash).toBe(80);
    expect(r.ccsElectronic).toBe(30);
  });

  it("scales door payouts when they exceed cash", () => {
    const doors = normalizeDoorPayouts([
      { slot_id: "a", name: "A", amount: 10 },
      { slot_id: "b", name: "B", amount: 10 },
    ]);
    const r = computeSocialDoorPayouts({
      cashTotal: 15,
      stripeTotal: 100,
      venueCost: 0,
      otherExpense: 0,
      doorRows: doors,
    });
    expect(r.doorTotal).toBeLessThanOrEqual(15);
    expect(r.isaiahCash).toBe(0);
  });
});
