import { DEFAULT_TIME_ZONE, getDateStringInTimeZone } from "@/lib/utils/dateHelpers";

export const DEFAULT_SOCIAL_VENUE_COST = 750;

export const DEFAULT_SOCIAL_BRANDON_RATIO = 0.2;
export const DEFAULT_SOCIAL_KYLER_RATIO = 0.3;
export const DEFAULT_SOCIAL_ISAIAH_RATIO = 0.5;

/** Social events on/after this calendar date (event TZ) use door + Isaiah cash / CCS electronic. */
export const SOCIAL_DOOR_PAYOUT_CUTOFF_YMD = "2026-07-17";

export const DEFAULT_SOCIAL_DOOR_PAYOUT = 10;

/** Default door payout for events with type = social. */
export const SOCIAL_EVENT_DOOR_PAYOUT = 20;

export function defaultDoorPayoutForEventType(type?: string | null): number {
  return (type || "").trim().toLowerCase() === "social"
    ? SOCIAL_EVENT_DOOR_PAYOUT
    : DEFAULT_SOCIAL_DOOR_PAYOUT;
}

export type MetricsRevenueInput = {
  cash_total?: number | null;
  stripe_total?: number | null;
  other_total?: number | null;
  ccs_team_total?: number | null;
};

export type SocialDoorPayoutRow = {
  slot_id: string | null;
  name: string;
  /** Effective / default amount (usually 10). */
  amount: number;
  /** When set, overrides amount for payout math. */
  amount_override?: number | null;
  paid_at?: string | null;
};

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function totalRevenueFromMetricsRow(metrics: MetricsRevenueInput | null): number {
  if (!metrics) return 0;
  return round2(
    Number(metrics.cash_total ?? 0) +
      Number(metrics.stripe_total ?? 0) +
      Number(metrics.other_total ?? 0) +
      Number(metrics.ccs_team_total ?? 0)
  );
}

/** True when the Social event start date (YYYY-MM-DD in event TZ) is on/after the door-payout cutoff. */
export function isSocialDoorPayoutModel(
  eventStartsAt: string | null | undefined,
  timeZone?: string | null
): boolean {
  if (!eventStartsAt) return false;
  const ymd = getDateStringInTimeZone(eventStartsAt, timeZone || DEFAULT_TIME_ZONE);
  if (!ymd) return false;
  return ymd >= SOCIAL_DOOR_PAYOUT_CUTOFF_YMD;
}

export function normalizeDoorPayouts(raw: unknown): SocialDoorPayoutRow[] {
  if (!Array.isArray(raw)) return [];
  const out: SocialDoorPayoutRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const amount =
      typeof rec.amount === "number" && Number.isFinite(rec.amount)
        ? round2(Math.max(0, rec.amount))
        : DEFAULT_SOCIAL_DOOR_PAYOUT;
    const amountOverride =
      rec.amount_override == null
        ? null
        : typeof rec.amount_override === "number" && Number.isFinite(rec.amount_override)
          ? round2(Math.max(0, rec.amount_override))
          : null;
    const slotId =
      typeof rec.slot_id === "string" && rec.slot_id.trim() ? rec.slot_id.trim() : null;
    const paidAt =
      typeof rec.paid_at === "string" && rec.paid_at.trim() ? rec.paid_at.trim() : null;
    out.push({
      slot_id: slotId,
      name: name || "Doorman",
      amount,
      amount_override: amountOverride,
      paid_at: paidAt,
    });
  }
  return out;
}

export function effectiveDoorAmount(row: SocialDoorPayoutRow): number {
  if (row.amount_override != null && Number.isFinite(row.amount_override)) {
    return round2(Math.max(0, row.amount_override));
  }
  return round2(Math.max(0, row.amount ?? DEFAULT_SOCIAL_DOOR_PAYOUT));
}

/**
 * Post-cutoff Social: door payouts from Cash; remaining Cash → Isaiah; Electronic after venue+other → CCS.
 * If door total exceeds cash, scale door amounts down equally (like Nashville teachers).
 */
export function computeSocialDoorPayouts({
  cashTotal,
  stripeTotal,
  venueCost,
  otherExpense = 0,
  doorRows,
}: {
  cashTotal: number;
  stripeTotal: number;
  venueCost: number;
  otherExpense?: number;
  doorRows: SocialDoorPayoutRow[];
}): {
  profit: number;
  doorAmounts: number[];
  doorTotal: number;
  scale: number;
  isaiahCash: number;
  ccsElectronic: number;
} {
  const cash = Math.max(0, round2(cashTotal));
  const stripe = round2(stripeTotal);
  const venue = Math.max(0, round2(venueCost));
  const other = Math.max(0, round2(otherExpense));
  const rawAmounts = doorRows.map((r) => effectiveDoorAmount(r));
  const rawTotal = round2(rawAmounts.reduce((s, a) => s + a, 0));
  let scale = 1;
  let doorAmounts = rawAmounts;
  let doorTotal = rawTotal;
  if (rawTotal > cash && rawTotal > 0) {
    scale = cash / rawTotal;
    doorAmounts = rawAmounts.map((a) => round2(a * scale));
    doorTotal = round2(doorAmounts.reduce((s, a) => s + a, 0));
    if (doorTotal > cash && doorAmounts.length > 0) {
      const diff = round2(doorTotal - cash);
      doorAmounts[doorAmounts.length - 1] = round2(
        Math.max(0, doorAmounts[doorAmounts.length - 1] - diff)
      );
      doorTotal = round2(doorAmounts.reduce((s, a) => s + a, 0));
    }
  }
  const isaiahCash = Math.max(0, round2(cash - doorTotal));
  const ccsElectronic = round2(stripe - venue - other);
  const profit = Math.max(0, round2(cash + stripe - venue - other - doorTotal));
  return {
    profit,
    doorAmounts,
    doorTotal,
    scale,
    isaiahCash,
    ccsElectronic,
  };
}

export function computeSocialSplit({
  totalRevenue,
  cashTotal,
  venueCost,
  otherExpense = 0,
  brandonRatio,
  kylerRatio,
  isaiahRatio,
  brandonProfitOverride,
  kylerProfitOverride,
}: {
  totalRevenue: number;
  cashTotal: number;
  venueCost: number;
  otherExpense?: number;
  brandonRatio: number;
  kylerRatio: number;
  isaiahRatio: number;
  brandonProfitOverride?: number;
  kylerProfitOverride?: number;
}): {
  brandon_profit: number;
  kyler_profit: number;
  isaiah_profit: number;
  isaiah_nominal: number;
  ccs_profit: number;
  ccs_cash_profit: number;
} {
  const distributable = Math.max(
    0,
    round2(totalRevenue - venueCost - Math.max(0, otherExpense))
  );
  const brandon_profit =
    brandonProfitOverride !== undefined
      ? round2(brandonProfitOverride)
      : round2(distributable * brandonRatio);
  const kyler_profit =
    kylerProfitOverride !== undefined
      ? round2(kylerProfitOverride)
      : round2(distributable * kylerRatio);
  const isaiah_nominal = round2(distributable * isaiahRatio);
  const cashAfterBrandonKyler = Math.max(0, round2(cashTotal - brandon_profit - kyler_profit));
  const isaiah_profit = Math.min(isaiah_nominal, cashAfterBrandonKyler);
  const ccs_profit = Math.max(0, round2(isaiah_nominal - isaiah_profit));
  const ccs_cash_profit = Math.max(
    0,
    round2(cashTotal - brandon_profit - kyler_profit - isaiah_profit)
  );
  return {
    brandon_profit,
    kyler_profit,
    isaiah_profit,
    isaiah_nominal,
    ccs_profit,
    ccs_cash_profit,
  };
}
