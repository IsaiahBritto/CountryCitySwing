import { resolveCollectedTicketAmount } from "@/lib/utils/signupCollectedAmount";
import { roundCurrency } from "@/lib/utils/paymentHelpers";
import { DEFAULT_TIME_ZONE, getDateStringInTimeZone } from "@/lib/utils/dateHelpers";
import {
  getEffectiveWorkshopPrice,
  isTeamPricingConfigured,
  normalizePriceChanges,
} from "@/lib/utils/workshopPricing";

export type FinanceSignupBucket =
  | "cash"
  | "stripe"
  | "other"
  | "ccs_team_cash"
  | "ccs_team_stripe"
  | "excluded";

export interface WorkshopEventPricing {
  price: number | null;
  price_changes?: unknown;
  ccs_team_price?: number | null;
  ccs_team_price_changes?: unknown;
  time_zone?: string | null;
  starts_at?: string | null;
}

export interface FinanceSignupInput {
  id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  created_at?: string | null;
  payment_method?: string | null;
  paid?: boolean | null;
  checked_in?: boolean | null;
  is_ccs_team?: boolean | null;
  amount_owed?: number | null;
  amount_paid?: number | null;
  principal_refunded_total?: number | null;
  net_amount_paid?: number | null;
  stripe_tax_amount?: number | null;
  stripe_processing_fee?: number | null;
  free_via_promotion_code?: boolean | null;
  used_promotion_code?: boolean | null;
}

export interface WorkshopSignupBreakdownRow {
  id: string;
  name: string;
  paymentMethod: string;
  listPriceAtSignup: number | null;
  collected: number;
  refunded: number;
  netRevenue: number;
  couponDiscount: number;
  stripeTax: number;
  stripeFee: number;
  promoLabel: "free" | "used" | "none";
  checkedIn: boolean;
  paid: boolean;
  bucket: FinanceSignupBucket;
  countsTowardTotals: boolean;
}

export interface WorkshopSignupBucketTotals {
  cash: number;
  stripe: number;
  other: number;
  ccsTeamCash: number;
  ccsTeamStripe: number;
  ccsTeamTotal: number;
  stripeTaxesFees: number;
  grossTotal: number;
  totalCouponDiscount: number;
  promoSignupCount: number;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function promoLabelFor(signup: FinanceSignupInput): "free" | "used" | "none" {
  if (signup.free_via_promotion_code === true) return "free";
  if (signup.used_promotion_code === true) return "used";
  return "none";
}

function signupDateYmd(
  signup: FinanceSignupInput,
  event: WorkshopEventPricing
): string {
  if (signup.created_at) {
    return getDateStringInTimeZone(
      signup.created_at,
      event.time_zone || DEFAULT_TIME_ZONE
    );
  }
  if (event.starts_at) {
    return getDateStringInTimeZone(
      event.starts_at,
      event.time_zone || DEFAULT_TIME_ZONE
    );
  }
  return getDateStringInTimeZone(new Date().toISOString(), event.time_zone || DEFAULT_TIME_ZONE);
}

export function listPriceAtSignupFor(
  signup: FinanceSignupInput,
  event: WorkshopEventPricing
): number {
  const pm = (signup.payment_method || "").toLowerCase().trim();
  const isCcsTeam = signup.is_ccs_team === true || pm === "ccs team";
  const asOf = signupDateYmd(signup, event);

  if (
    isCcsTeam &&
    isTeamPricingConfigured(event.ccs_team_price, normalizePriceChanges(event.ccs_team_price_changes))
  ) {
    return getEffectiveWorkshopPrice(
      event.ccs_team_price,
      normalizePriceChanges(event.ccs_team_price_changes),
      asOf
    );
  }

  return getEffectiveWorkshopPrice(
    event.price,
    normalizePriceChanges(event.price_changes),
    asOf
  );
}

export function couponDiscountFor(
  signup: FinanceSignupInput,
  listPrice: number,
  netRevenue: number
): number {
  const promoLabel = promoLabelFor(signup);
  if (promoLabel === "none") return 0;
  if (promoLabel === "free") return round2(Math.max(0, listPrice));
  return round2(Math.max(0, listPrice - netRevenue));
}

function netRevenueFor(signup: FinanceSignupInput, collected: number): number {
  if (signup.net_amount_paid != null && Number.isFinite(Number(signup.net_amount_paid))) {
    return roundCurrency(Number(signup.net_amount_paid));
  }
  const refunded = Number(signup.principal_refunded_total ?? 0);
  return roundCurrency(Math.max(0, collected - (Number.isFinite(refunded) ? refunded : 0)));
}

export function classifyWorkshopSignupFinance(
  signup: FinanceSignupInput,
  eventPriceFallback: number | null
): Pick<
  WorkshopSignupBreakdownRow,
  "bucket" | "countsTowardTotals" | "collected" | "netRevenue" | "stripeTax" | "stripeFee"
> {
  const price = eventPriceFallback ?? 0;
  const pm = (signup.payment_method || "").toLowerCase().trim();
  const isCcsTeam = signup.is_ccs_team === true || pm === "ccs team";
  const checkedIn = signup.checked_in === true;
  const paid = signup.paid === true;
  const freeViaPromo = signup.free_via_promotion_code === true;
  const collected = resolveCollectedTicketAmount(signup, price);
  const netRevenue = netRevenueFor(signup, collected);
  const stripeTax = Number(signup.stripe_tax_amount ?? 0);
  const stripeFee = Number(signup.stripe_processing_fee ?? 0);

  if (isCcsTeam) {
    if ((pm === "cash" || pm === "ccs team") && paid) {
      return {
        bucket: "ccs_team_cash",
        countsTowardTotals: true,
        collected,
        netRevenue,
        stripeTax: 0,
        stripeFee: 0,
      };
    }
    if (pm === "stripe" && paid) {
      return {
        bucket: "ccs_team_stripe",
        countsTowardTotals: true,
        collected,
        netRevenue,
        stripeTax,
        stripeFee,
      };
    }
    return {
      bucket: "excluded",
      countsTowardTotals: false,
      collected,
      netRevenue: 0,
      stripeTax: 0,
      stripeFee: 0,
    };
  }

  if (freeViaPromo) {
    return {
      bucket: "excluded",
      countsTowardTotals: false,
      collected,
      netRevenue: 0,
      stripeTax: 0,
      stripeFee: 0,
    };
  }

  if (pm === "cash" && paid) {
    return {
      bucket: "cash",
      countsTowardTotals: true,
      collected,
      netRevenue,
      stripeTax: 0,
      stripeFee: 0,
    };
  }

  if (pm === "stripe" && paid) {
    return {
      bucket: "stripe",
      countsTowardTotals: true,
      collected,
      netRevenue,
      stripeTax,
      stripeFee,
    };
  }

  if (checkedIn && paid) {
    return {
      bucket: "other",
      countsTowardTotals: true,
      collected,
      netRevenue,
      stripeTax: 0,
      stripeFee: 0,
    };
  }

  return {
    bucket: "excluded",
    countsTowardTotals: false,
    collected,
    netRevenue: 0,
    stripeTax: 0,
    stripeFee: 0,
  };
}

export function buildWorkshopSignupBreakdownRow(
  signup: FinanceSignupInput,
  event: WorkshopEventPricing
): WorkshopSignupBreakdownRow {
  const listPrice = listPriceAtSignupFor(signup, event);
  const classified = classifyWorkshopSignupFinance(signup, event.price);
  const refunded = roundCurrency(
    Math.max(0, classified.collected - classified.netRevenue)
  );
  const promoLabel = promoLabelFor(signup);
  const couponDiscount = couponDiscountFor(signup, listPrice, classified.netRevenue);
  const first = (signup.first_name || "").trim();
  const last = (signup.last_name || "").trim();
  const name = [first, last].filter(Boolean).join(" ") || "—";

  return {
    id: String(signup.id),
    name,
    paymentMethod: signup.payment_method || "—",
    listPriceAtSignup: round2(listPrice),
    collected: round2(classified.collected),
    refunded,
    netRevenue: classified.netRevenue,
    couponDiscount,
    stripeTax: round2(classified.stripeTax),
    stripeFee: round2(classified.stripeFee),
    promoLabel,
    checkedIn: signup.checked_in === true,
    paid: signup.paid === true,
    bucket: classified.bucket,
    countsTowardTotals: classified.countsTowardTotals,
  };
}

const BUCKET_SORT_ORDER: Record<FinanceSignupBucket, number> = {
  stripe: 0,
  cash: 1,
  other: 2,
  ccs_team_stripe: 3,
  ccs_team_cash: 4,
  excluded: 5,
};

export function sortWorkshopSignupBreakdownRows(
  rows: WorkshopSignupBreakdownRow[]
): WorkshopSignupBreakdownRow[] {
  return [...rows].sort((a, b) => {
    const order = BUCKET_SORT_ORDER[a.bucket] - BUCKET_SORT_ORDER[b.bucket];
    if (order !== 0) return order;
    return a.name.localeCompare(b.name);
  });
}

export function computeTotalCouponDiscount(
  signups: FinanceSignupInput[],
  event: WorkshopEventPricing
): number {
  if (!signups.length) return 0;
  return buildWorkshopSignupBreakdown(signups, event).totals.totalCouponDiscount;
}

export type RegistrationTotalsInput = {
  cashTotal: number;
  stripeTotal: number;
  otherTotal?: number;
  ccsTeamTotal?: number;
  couponDiscountTotal?: number;
  defaultCcsDiscountTotal?: number;
};

/** Default CCS team discount equals CCS TEAM total collected. */
export function defaultCcsDiscountTotalFrom(stats: {
  ccsTeamTotal?: number;
}): number {
  return round2(stats.ccsTeamTotal ?? 0);
}

export function adjustedWorkshopGuestInstructorAmount(
  rawGuestAmount: number,
  defaultCcsDiscountTotal: number
): number {
  return round2(rawGuestAmount + defaultCcsDiscountTotal);
}

export function adjustedWorkshopCcsAmount(
  rawCcsAmount: number,
  defaultCcsDiscountTotal: number
): number {
  return round2(Math.max(0, rawCcsAmount - defaultCcsDiscountTotal));
}

export function netCollectedRegistrationTotal(stats: RegistrationTotalsInput): number {
  return round2(
    stats.cashTotal +
      stats.stripeTotal +
      (stats.otherTotal ?? 0) +
      (stats.ccsTeamTotal ?? 0)
  );
}

/** Gross registration value: net collected plus coupon and CCS team discounts. */
export function combinedRegistrationTotal(stats: RegistrationTotalsInput): number {
  const ccsDiscount =
    stats.defaultCcsDiscountTotal ?? defaultCcsDiscountTotalFrom(stats);
  return round2(
    netCollectedRegistrationTotal(stats) +
      (stats.couponDiscountTotal ?? 0) +
      ccsDiscount
  );
}

export function buildWorkshopSignupBreakdown(
  signups: FinanceSignupInput[],
  event: WorkshopEventPricing
): { rows: WorkshopSignupBreakdownRow[]; totals: WorkshopSignupBucketTotals } {
  const rows = sortWorkshopSignupBreakdownRows(
    signups.map((s) => buildWorkshopSignupBreakdownRow(s, event))
  );

  const totals: WorkshopSignupBucketTotals = {
    cash: 0,
    stripe: 0,
    other: 0,
    ccsTeamCash: 0,
    ccsTeamStripe: 0,
    ccsTeamTotal: 0,
    stripeTaxesFees: 0,
    grossTotal: 0,
    totalCouponDiscount: 0,
    promoSignupCount: 0,
  };

  for (const row of rows) {
    if (row.promoLabel !== "none") {
      totals.promoSignupCount += 1;
      totals.totalCouponDiscount += row.couponDiscount;
    }
    if (!row.countsTowardTotals) continue;
    totals.grossTotal += row.netRevenue;
    switch (row.bucket) {
      case "cash":
        totals.cash += row.netRevenue;
        break;
      case "stripe":
        totals.stripe += row.netRevenue;
        totals.stripeTaxesFees += row.stripeTax + row.stripeFee;
        break;
      case "other":
        totals.other += row.netRevenue;
        break;
      case "ccs_team_cash":
        totals.ccsTeamCash += row.netRevenue;
        break;
      case "ccs_team_stripe":
        totals.ccsTeamStripe += row.netRevenue;
        totals.stripeTaxesFees += row.stripeTax + row.stripeFee;
        break;
      default:
        break;
    }
  }

  totals.cash = round2(totals.cash);
  totals.stripe = round2(totals.stripe);
  totals.other = round2(totals.other);
  totals.ccsTeamCash = round2(totals.ccsTeamCash);
  totals.ccsTeamStripe = round2(totals.ccsTeamStripe);
  totals.ccsTeamTotal = round2(totals.ccsTeamCash + totals.ccsTeamStripe);
  totals.stripeTaxesFees = round2(totals.stripeTaxesFees);
  totals.grossTotal = round2(totals.grossTotal);
  totals.totalCouponDiscount = round2(totals.totalCouponDiscount);

  return { rows, totals };
}

export function bucketLabel(bucket: FinanceSignupBucket): string {
  switch (bucket) {
    case "cash":
      return "Cash";
    case "stripe":
      return "Stripe";
    case "other":
      return "Other";
    case "ccs_team_cash":
      return "CCS Team · Cash";
    case "ccs_team_stripe":
      return "CCS Team · Stripe";
    default:
      return "Excluded";
  }
}

export function totalsMatchMetrics(
  totals: WorkshopSignupBucketTotals,
  metrics: {
    cash_total: number;
    stripe_total: number;
    other_total: number;
    ccs_team_cash_total: number;
    ccs_team_stripe_total: number;
    stripe_taxes_fees_total: number;
  },
  tolerance = 0.01
): boolean {
  return (
    Math.abs(totals.cash - Number(metrics.cash_total)) <= tolerance &&
    Math.abs(totals.stripe - Number(metrics.stripe_total)) <= tolerance &&
    Math.abs(totals.other - Number(metrics.other_total)) <= tolerance &&
    Math.abs(totals.ccsTeamCash - Number(metrics.ccs_team_cash_total)) <= tolerance &&
    Math.abs(totals.ccsTeamStripe - Number(metrics.ccs_team_stripe_total)) <= tolerance &&
    Math.abs(totals.stripeTaxesFees - Number(metrics.stripe_taxes_fees_total)) <= tolerance
  );
}
