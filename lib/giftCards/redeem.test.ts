import { describe, expect, it } from "vitest";
import { computeGiftApplyAmount, giftCardPaymentMethodLabel } from "@/lib/giftCards/amount";

describe("gift card redeem helpers", () => {
  it("computeGiftApplyAmount caps by balance and order total", () => {
    expect(computeGiftApplyAmount(100, 40)).toBe(40);
    expect(computeGiftApplyAmount(25, 40)).toBe(25);
    expect(computeGiftApplyAmount(100, 40, 30)).toBe(30);
  });

  it("giftCardPaymentMethodLabel shows hybrid methods", () => {
    expect(giftCardPaymentMethodLabel(50, null)).toBe("Gift Card");
    expect(giftCardPaymentMethodLabel(50, "Cash")).toBe("Gift Card + Cash");
    expect(giftCardPaymentMethodLabel(50, "Stripe")).toBe("Gift Card + Stripe");
  });
});