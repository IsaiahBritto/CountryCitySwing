export const DEFAULT_SOCIAL_VENUE_COST = 750;

export const DEFAULT_SOCIAL_BRANDON_RATIO = 0.2;
export const DEFAULT_SOCIAL_KYLER_RATIO = 0.3;
export const DEFAULT_SOCIAL_ISAIAH_RATIO = 0.5;

export type MetricsRevenueInput = {
  cash_total?: number | null;
  stripe_total?: number | null;
  other_total?: number | null;
  ccs_team_total?: number | null;
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
