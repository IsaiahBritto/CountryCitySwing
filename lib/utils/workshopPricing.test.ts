import { describe, expect, it } from "vitest";
import {
  getEffectiveWorkshopPrice,
  getNextPriceChangeDate,
  hasDuplicatePriceChangeDates,
  isTeamPricingConfigured,
  listEffectiveSchedulePrices,
  resolveDueNowForSignup,
  resolveSignupListPrice,
} from "@/lib/utils/workshopPricing";

describe("workshopPricing", () => {
  const changes = [
    { effective_date: "2026-03-01", price: 40 },
    { effective_date: "2026-04-01", price: 50 },
    { effective_date: "2026-05-01", price: 45 },
  ];

  it("uses base price before any change", () => {
    expect(getEffectiveWorkshopPrice(30, changes, "2026-02-15")).toBe(30);
  });

  it("applies latest change on or before as-of date including decreases", () => {
    expect(getEffectiveWorkshopPrice(30, changes, "2026-03-15")).toBe(40);
    expect(getEffectiveWorkshopPrice(30, changes, "2026-04-01")).toBe(50);
    expect(getEffectiveWorkshopPrice(30, changes, "2026-05-10")).toBe(45);
  });

  it("finds next price change date", () => {
    expect(getNextPriceChangeDate(changes, "2026-03-15")).toBe("2026-04-01");
    expect(getNextPriceChangeDate(changes, "2026-05-10")).toBeNull();
  });

  it("lists only prices that have taken effect", () => {
    expect(listEffectiveSchedulePrices(30, changes, "2026-03-15")).toEqual([30, 40]);
    expect(listEffectiveSchedulePrices(30, changes, "2026-05-10")).toEqual([30, 40, 45, 50]);
  });

  it("detects duplicate dates", () => {
    expect(
      hasDuplicatePriceChangeDates([
        { effective_date: "2026-01-01", price: 1 },
        { effective_date: "2026-01-01", price: 2 },
      ])
    ).toBe(true);
    expect(hasDuplicatePriceChangeDates(changes)).toBe(false);
  });

  it("falls back to public price when team pricing is not configured", () => {
    expect(isTeamPricingConfigured(null, [])).toBe(false);
    expect(
      resolveSignupListPrice(
        {
          price: 30,
          price_changes: [{ effective_date: "2026-01-01", price: 40 }],
          ccs_team_price: null,
          ccs_team_price_changes: [],
          time_zone: "America/Chicago",
        },
        { isCcsTeam: true, asOfDateYmd: "2026-06-01" }
      )
    ).toBe(40);
  });

  it("uses team schedule once any team price is set", () => {
    expect(isTeamPricingConfigured(0, [])).toBe(true);
    expect(
      resolveSignupListPrice(
        {
          price: 30,
          price_changes: [{ effective_date: "2026-01-01", price: 40 }],
          ccs_team_price: 10,
          ccs_team_price_changes: [{ effective_date: "2026-02-01", price: 15 }],
          time_zone: "America/Chicago",
        },
        { isCcsTeam: true, asOfDateYmd: "2026-06-01" }
      )
    ).toBe(15);
  });

  it("uses amount_due override for Due now when set", () => {
    const event = {
      price: 30,
      price_changes: [{ effective_date: "2026-04-01", price: 50 }],
      time_zone: "America/Chicago",
    };
    expect(
      resolveDueNowForSignup(event, {
        amount_due: 25,
        amount_owed: 30,
        is_ccs_team: false,
      })
    ).toBe(25);
    expect(
      resolveDueNowForSignup(event, {
        amount_due: null,
        amount_owed: 30,
        is_ccs_team: false,
      })
    ).toBe(resolveSignupListPrice(event, { isCcsTeam: false }));
  });
});
