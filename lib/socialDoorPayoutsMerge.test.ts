import { describe, expect, it } from "vitest";
import { SOCIAL_EVENT_DOOR_PAYOUT } from "@/lib/socialFinancesConstants";
import {
  doorPayoutRowsEqual,
  mergeDoorPayoutsFromSlots,
} from "@/lib/socialDoorPayoutsMerge";

describe("mergeDoorPayoutsFromSlots", () => {
  it("creates rows for filled doorman slots with social default amount", () => {
    const rows = mergeDoorPayoutsFromSlots({
      existingRows: [],
      defaultAmount: SOCIAL_EVENT_DOOR_PAYOUT,
      slots: [
        {
          id: "slot-1",
          position: "Doorman",
          assignee_id: "user-1",
          slot_starts_at: "2026-08-01T18:00:00Z",
          assignee: { first_name: "Alex", last_name: "Smith" },
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alex Smith");
    expect(rows[0].amount).toBe(20);
    expect(rows[0].slot_id).toBe("slot-1");
  });

  it("preserves overrides and paid_at for matching slots", () => {
    const rows = mergeDoorPayoutsFromSlots({
      existingRows: [
        {
          slot_id: "slot-1",
          name: "Old Name",
          amount: 20,
          amount_override: 25,
          paid_at: "2026-08-01T00:00:00Z",
        },
      ],
      defaultAmount: SOCIAL_EVENT_DOOR_PAYOUT,
      slots: [
        {
          id: "slot-1",
          position: "Doorman",
          assignee_id: "user-1",
          assignee: { first_name: "Alex", last_name: "Smith" },
        },
      ],
    });
    expect(rows[0].name).toBe("Alex Smith");
    expect(rows[0].amount).toBe(20);
    expect(rows[0].amount_override).toBe(25);
    expect(rows[0].paid_at).toBe("2026-08-01T00:00:00Z");
  });

  it("keeps rows for cleared slots", () => {
    const rows = mergeDoorPayoutsFromSlots({
      existingRows: [
        {
          slot_id: "slot-old",
          name: "Former Doorman",
          amount: 20,
          amount_override: null,
          paid_at: null,
        },
      ],
      defaultAmount: SOCIAL_EVENT_DOOR_PAYOUT,
      slots: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Former Doorman");
  });
});

describe("doorPayoutRowsEqual", () => {
  it("detects name drift", () => {
    const a = [{ slot_id: "1", name: "A", amount: 20, amount_override: null, paid_at: null }];
    const b = [{ slot_id: "1", name: "B", amount: 20, amount_override: null, paid_at: null }];
    expect(doorPayoutRowsEqual(a, b)).toBe(false);
  });
});
