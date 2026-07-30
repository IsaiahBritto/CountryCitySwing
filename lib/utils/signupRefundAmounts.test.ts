import { describe, expect, it } from "vitest";
import { computePartialStripeRefund } from "@/lib/utils/signupRefundAmounts";

describe("computePartialStripeRefund", () => {
  it("adds proportional fee and tax", () => {
    const r = computePartialStripeRefund({
      principalRefund: 20,
      principalPaid: 40,
      stripeProcessingFee: 2,
      stripeTaxAmount: 4,
      priorRefunds: [],
      paymentIntentRemainingCents: 4600,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.principal).toBe(20);
    expect(r.fee).toBe(1);
    expect(r.tax).toBe(2);
    expect(r.total).toBe(23);
    expect(r.treatsAsFull).toBe(false);
  });

  it("omits null fee and tax", () => {
    const r = computePartialStripeRefund({
      principalRefund: 10,
      principalPaid: 40,
      stripeProcessingFee: null,
      stripeTaxAmount: null,
      priorRefunds: [],
      paymentIntentRemainingCents: 4000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fee).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.total).toBe(10);
  });

  it("rejects principal above remaining after prior refunds", () => {
    const r = computePartialStripeRefund({
      principalRefund: 25,
      principalPaid: 40,
      stripeProcessingFee: 2,
      stripeTaxAmount: 0,
      priorRefunds: [
        { principal_refunded: 20, fee_refunded: 1, tax_refunded: 0, amount_refunded: 21 },
      ],
      paymentIntentRemainingCents: 2100,
    });
    expect(r.ok).toBe(false);
  });

  it("treats as full when computed amount sweeps remaining PI", () => {
    const r = computePartialStripeRefund({
      principalRefund: 40,
      principalPaid: 40,
      stripeProcessingFee: 2,
      stripeTaxAmount: 4,
      priorRefunds: [],
      paymentIntentRemainingCents: 4600,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.treatsAsFull).toBe(true);
  });
});
