import { describe, expect, it } from "vitest";
import { computeNashvillePayouts } from "@/lib/utils/nashvillePayouts";

describe("Nashville payouts with gift cards", () => {
  it("includes gift card value in profit and teacher pay capacity", () => {
    const withoutGift = computeNashvillePayouts({
      cashTotal: 100,
      stripeTotal: 0,
      venueCost: 50,
    });
    const withGift = computeNashvillePayouts({
      cashTotal: 100,
      stripeTotal: 0,
      giftCardTotal: 40,
      venueCost: 50,
    });
    expect(withGift.profit).toBeGreaterThan(withoutGift.profit);
    expect(withGift.teacherPayoutTotal).toBeGreaterThanOrEqual(
      withoutGift.teacherPayoutTotal
    );
  });
});