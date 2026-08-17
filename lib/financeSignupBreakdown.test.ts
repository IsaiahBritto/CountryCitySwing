import { describe, expect, it } from "vitest";
import {
  buildWorkshopSignupBreakdown,
  combinedRegistrationTotal,
  adjustedWorkshopCcsAmount,
  adjustedWorkshopGuestInstructorAmount,
  classifyWorkshopSignupFinance,
  couponDiscountFor,
  defaultCcsDiscountTotalFrom,
  listPriceAtSignupFor,
  netCollectedRegistrationTotal,
} from "@/lib/financeSignupBreakdown";

const baseEvent = {
  price: 50,
  price_changes: [],
  ccs_team_price: 24,
  ccs_team_price_changes: [],
  time_zone: "America/Chicago",
  starts_at: "2026-08-15T18:00:00-05:00",
};

describe("classifyWorkshopSignupFinance", () => {
  it("classifies paid Stripe signups", () => {
    const result = classifyWorkshopSignupFinance(
      {
        id: "1",
        payment_method: "Stripe",
        paid: true,
        amount_paid: 50,
        stripe_tax_amount: 2,
        stripe_processing_fee: 1.75,
      },
      60
    );
    expect(result.bucket).toBe("stripe");
    expect(result.countsTowardTotals).toBe(true);
    expect(result.collected).toBe(50);
    expect(result.netRevenue).toBe(50);
    expect(result.stripeTax).toBe(2);
    expect(result.stripeFee).toBe(1.75);
  });

  it("classifies cash paid signups", () => {
    const result = classifyWorkshopSignupFinance(
      {
        id: "2",
        payment_method: "Cash",
        paid: true,
        amount_paid: 40,
      },
      50
    );
    expect(result.bucket).toBe("cash");
    expect(result.netRevenue).toBe(40);
  });

  it("excludes free promo signups from revenue buckets", () => {
    const result = classifyWorkshopSignupFinance(
      {
        id: "3",
        payment_method: "Stripe",
        paid: true,
        free_via_promotion_code: true,
        amount_paid: 0,
      },
      50
    );
    expect(result.bucket).toBe("excluded");
    expect(result.countsTowardTotals).toBe(false);
  });

  it("classifies CCS team Stripe", () => {
    const result = classifyWorkshopSignupFinance(
      {
        id: "4",
        payment_method: "Stripe",
        paid: true,
        is_ccs_team: true,
        amount_paid: 24,
      },
      50
    );
    expect(result.bucket).toBe("ccs_team_stripe");
    expect(result.netRevenue).toBe(24);
  });

  it("uses net_amount_paid after partial refund", () => {
    const result = classifyWorkshopSignupFinance(
      {
        id: "5",
        payment_method: "Stripe",
        paid: true,
        amount_paid: 50,
        net_amount_paid: 37.65,
        principal_refunded_total: 12.35,
      },
      50
    );
    expect(result.netRevenue).toBe(37.65);
  });
});

describe("coupon discount", () => {
  it("uses list price at signup date for tiered pricing", () => {
    const event = {
      ...baseEvent,
      price_changes: [{ effective_date: "2026-08-14", price: 60 }],
    };
    const signup = {
      id: "early",
      created_at: "2026-08-10T12:00:00Z",
      payment_method: "Stripe",
      paid: true,
      amount_paid: 50,
    };
    expect(listPriceAtSignupFor(signup, event)).toBe(50);
    expect(listPriceAtSignupFor({ ...signup, created_at: "2026-08-15T12:00:00Z" }, event)).toBe(
      60
    );
  });

  it("computes partial promo discount as list price minus net paid", () => {
    const signup = {
      id: "j",
      payment_method: "Stripe",
      paid: true,
      used_promotion_code: true,
      amount_paid: 11.35,
      created_at: "2026-08-10T12:00:00Z",
    };
    expect(couponDiscountFor(signup, 50, 11.35)).toBe(38.65);
  });

  it("counts full list price as discount for free promo", () => {
    const signup = {
      id: "free",
      payment_method: "Stripe",
      paid: true,
      free_via_promotion_code: true,
      amount_paid: 0,
    };
    expect(couponDiscountFor(signup, 50, 0)).toBe(50);
  });
});

describe("buildWorkshopSignupBreakdown", () => {
  it("aggregates bucket totals from net revenue", () => {
    const { totals } = buildWorkshopSignupBreakdown(
      [
        {
          id: "1",
          first_name: "A",
          last_name: "One",
          payment_method: "Stripe",
          paid: true,
          amount_paid: 50,
          stripe_processing_fee: 1.75,
        },
        {
          id: "2",
          first_name: "B",
          last_name: "Two",
          payment_method: "Cash",
          paid: true,
          amount_paid: 40,
        },
      ],
      baseEvent
    );
    expect(totals.stripe).toBe(50);
    expect(totals.cash).toBe(40);
    expect(totals.grossTotal).toBe(90);
    expect(totals.stripeTaxesFees).toBe(1.75);
    expect(totals.totalCouponDiscount).toBe(0);
    expect(totals.promoSignupCount).toBe(0);
  });

  it("sums coupon discounts across promo signups", () => {
    const { rows, totals } = buildWorkshopSignupBreakdown(
      [
        {
          id: "1",
          first_name: "Jason",
          last_name: "C",
          payment_method: "Stripe",
          paid: true,
          used_promotion_code: true,
          amount_paid: 11.35,
          created_at: "2026-08-10T12:00:00Z",
        },
        {
          id: "2",
          first_name: "Free",
          last_name: "Guest",
          payment_method: "Stripe",
          paid: true,
          free_via_promotion_code: true,
          amount_paid: 0,
        },
      ],
      baseEvent
    );
    expect(rows[0].couponDiscount).toBe(38.65);
    expect(rows[1].couponDiscount).toBe(50);
    expect(totals.totalCouponDiscount).toBe(88.65);
    expect(totals.promoSignupCount).toBe(2);
  });
});

describe("registration totals", () => {
  it("adds coupon discounts to net collected for combined total", () => {
    const stats = {
      cashTotal: 100,
      stripeTotal: 50,
      otherTotal: 0,
      ccsTeamTotal: 24,
      couponDiscountTotal: 38.65,
    };
    expect(netCollectedRegistrationTotal(stats)).toBe(174);
    expect(combinedRegistrationTotal(stats)).toBe(236.65);
  });

  it("adds coupon and default CCS team discount to combined total", () => {
    const stats = {
      cashTotal: 100,
      stripeTotal: 50,
      otherTotal: 0,
      ccsTeamTotal: 75,
      couponDiscountTotal: 38.65,
    };
    expect(netCollectedRegistrationTotal(stats)).toBe(225);
    expect(defaultCcsDiscountTotalFrom(stats)).toBe(75);
    expect(combinedRegistrationTotal(stats)).toBe(338.65);
  });

  it("adjusts workshop guest and CCS amounts for default CCS discount", () => {
    expect(adjustedWorkshopGuestInstructorAmount(900, 75)).toBe(975);
    expect(adjustedWorkshopCcsAmount(100, 75)).toBe(25);
  });
});
