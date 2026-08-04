import { describe, expect, it } from "vitest";
import {
  itemsForRecipient,
  recipientCanSend,
  recipientSendStatus,
  computeNextFinisher,
  computeNextPlacement,
  type PrizeItemRow,
  type PrizeRecipientRow,
} from "@/lib/comps/prizeAwardsLogic";

const lead: PrizeRecipientRow = {
  id: "lead-1",
  group_id: "g1",
  role: "lead",
  first_name: "Alice",
  last_name: "A",
  email: "alice@example.com",
  profile_id: null,
  email_sent_at: null,
  prizes_updated_at: "2026-01-01T00:00:00Z",
};

const follow: PrizeRecipientRow = {
  id: "follow-1",
  group_id: "g1",
  role: "follow",
  first_name: "Bob",
  last_name: "B",
  email: "bob@example.com",
  profile_id: null,
  email_sent_at: null,
  prizes_updated_at: "2026-01-01T00:00:00Z",
};

const leadItems: PrizeItemRow[] = [
  {
    id: "i1",
    recipient_id: "lead-1",
    description: "Gift card",
    redemption_code: "ABC",
    sort_order: 0,
  },
];

describe("recipientCanSend", () => {
  it("requires email and prize description", () => {
    expect(recipientCanSend(lead, leadItems)).toBe(true);
    expect(recipientCanSend({ ...lead, email: null }, leadItems)).toBe(false);
    expect(recipientCanSend(lead, [{ description: "  " }])).toBe(false);
  });

  it("blocks resend until prizes updated (Option C)", () => {
    const sent = {
      ...lead,
      email_sent_at: "2026-01-02T00:00:00Z",
      prizes_updated_at: "2026-01-01T00:00:00Z",
    };
    expect(recipientCanSend(sent, leadItems)).toBe(false);

    const updated = {
      ...sent,
      prizes_updated_at: "2026-01-03T00:00:00Z",
    };
    expect(recipientCanSend(updated, leadItems)).toBe(true);
  });
});

describe("recipientSendStatus", () => {
  it("reports status labels", () => {
    expect(recipientSendStatus(lead, leadItems)).toBe("ready");
    expect(recipientSendStatus({ ...lead, email: "" }, leadItems)).toBe("no_email");
    expect(recipientSendStatus(lead, [])).toBe("needs_prizes");
  });
});

describe("itemsForRecipient", () => {
  it("mirrors lead items when shared", () => {
    const map = new Map([["lead-1", leadItems]]);
    expect(itemsForRecipient(follow, lead, map, true)).toEqual(leadItems);
    expect(itemsForRecipient(lead, lead, map, true)).toEqual(leadItems);
  });

  it("uses own items when not shared", () => {
    const followItems: PrizeItemRow[] = [
      {
        id: "i2",
        recipient_id: "follow-1",
        description: "Shirt",
        redemption_code: null,
        sort_order: 0,
      },
    ];
    const map = new Map([
      ["lead-1", leadItems],
      ["follow-1", followItems],
    ]);
    expect(itemsForRecipient(follow, lead, map, false)).toEqual(followItems);
  });
});

describe("computeNextPlacement", () => {
  it("returns lowest missing placement number", () => {
    const all = [{ placement: 1 }, { placement: 2 }, { placement: 3 }, { placement: 4 }];
    expect(computeNextPlacement(all, new Set([1, 2, 3]))).toBe(4);
    expect(computeNextPlacement(all, new Set([1, 2, 3, 4]))).toBeNull();
  });
});

describe("computeNextFinisher", () => {
  it("returns next row by round entry id", () => {
    const all = [
      { placement: 1, roundEntryId: "a" },
      { placement: 1, roundEntryId: "b" },
      { placement: 3, roundEntryId: "c" },
    ];
    expect(computeNextFinisher(all, new Set(["a"]))).toEqual(all[1]);
    expect(computeNextFinisher(all, new Set(["a", "b", "c"]))).toBeNull();
  });
});
