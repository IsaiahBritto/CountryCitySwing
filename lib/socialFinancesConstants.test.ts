import { describe, expect, it } from "vitest";
import {
  buildSocialDoorAllocationItems,
  computeSocialDoorPayouts,
  defaultDoorPayoutForEventType,
  formatSignedAllocationAmount,
  isSocialDoorPayoutModel,
  normalizeDoorPayouts,
  SOCIAL_DOOR_PAYOUT_CUTOFF_YMD,
  SOCIAL_EVENT_DOOR_PAYOUT,
} from "@/lib/socialFinancesConstants";
import { applyDoorPayoutMarkPaid } from "@/lib/socialDoorPayoutsMerge";

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

describe("buildSocialDoorAllocationItems", () => {
  it("shows door payouts as negative deductions from Isaiah cash", () => {
    const doorRows = normalizeDoorPayouts([
      { slot_id: "a", name: "Alex", amount: 20 },
      { slot_id: "b", name: "Blake", amount: 20 },
    ]);
    const payouts = computeSocialDoorPayouts({
      cashTotal: 100,
      stripeTotal: 800,
      venueCost: 750,
      otherExpense: 20,
      doorRows,
    });
    const items = buildSocialDoorAllocationItems({
      cashTotal: 100,
      venueCost: 750,
      otherExpense: 20,
      otherExpenseComment: "Supplies",
      doorRows,
      doorAmounts: payouts.doorAmounts,
      isaiahCash: payouts.isaiahCash,
      ccsElectronic: payouts.ccsElectronic,
    });
    expect(items.find((i) => i.label === "Cash → Isaiah")?.value).toBe(100);
    expect(items.filter((i) => i.indent).map((i) => i.value)).toEqual([-20, -20]);
    expect(items.find((i) => i.label === "Isaiah cash (net)")?.value).toBe(60);
    expect(items.find((i) => i.label === "Isaiah cash (net)")?.excludeFromTotal).toBe(true);
    const reconcileTotal =
      750 + 20 + payouts.doorTotal + payouts.isaiahCash + payouts.ccsElectronic;
    expect(reconcileTotal).toBe(900);
  });
});

describe("formatSignedAllocationAmount", () => {
  it("formats negative amounts with a minus sign", () => {
    expect(formatSignedAllocationAmount(-20)).toBe("−$20.00");
    expect(formatSignedAllocationAmount(15.5)).toBe("$15.50");
  });
});

describe("applyDoorPayoutMarkPaid", () => {
  it("marks paid by slot_id", () => {
    const doors = normalizeDoorPayouts([
      { slot_id: "slot-a", name: "Alex", amount: 20 },
      { slot_id: "slot-b", name: "Blake", amount: 20 },
    ]);
    const { doors: updated, marked } = applyDoorPayoutMarkPaid(doors, {
      slotId: "slot-b",
      paidAt: "2026-08-22T12:00:00.000Z",
    });
    expect(marked).toBe(true);
    expect(updated[0].paid_at).toBeNull();
    expect(updated[1].paid_at).toBe("2026-08-22T12:00:00.000Z");
  });

  it("falls back to index for manual rows without slot_id", () => {
    const doors = normalizeDoorPayouts([{ slot_id: null, name: "Manual", amount: 15 }]);
    const { doors: updated, marked } = applyDoorPayoutMarkPaid(doors, {
      index: 0,
      paidAt: "2026-08-22T12:00:00.000Z",
    });
    expect(marked).toBe(true);
    expect(updated[0].paid_at).toBe("2026-08-22T12:00:00.000Z");
  });

  it("returns marked false when target is missing", () => {
    const doors = normalizeDoorPayouts([
      { slot_id: "slot-a", name: "Alex", amount: 20 },
    ]);
    const { marked } = applyDoorPayoutMarkPaid(doors, {
      slotId: "missing",
      paidAt: "2026-08-22T12:00:00.000Z",
    });
    expect(marked).toBe(false);
  });
});
