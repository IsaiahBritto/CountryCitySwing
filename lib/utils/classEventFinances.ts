/**
 * Generic Class event finances (non-Nashville).
 * Manual payouts from cash; remainder Cash → Isaiah, Electronic (Stripe − venue) → CCS.
 */

export interface ClassEventFinancesInput {
  cashTotal: number;
  stripeTotal: number;
  venueCost: number;
  payoutAmounts: number[];
}

export interface ClassEventFinancesResult {
  totalRevenue: number;
  payoutTotal: number;
  isaiahPayout: number;
  ccsElectronic: number;
  allocationsTotal: number;
  reconciliationDiff: number;
}

function roundToCents(x: number): number {
  return Math.round(x * 100) / 100;
}

export function computeClassEventFinances(
  input: ClassEventFinancesInput
): ClassEventFinancesResult {
  const { cashTotal, stripeTotal, venueCost, payoutAmounts } = input;
  const totalRevenue = roundToCents(cashTotal + stripeTotal);
  const payoutTotal = roundToCents(
    payoutAmounts.reduce((sum, a) => sum + (Number.isFinite(a) ? Math.max(0, a) : 0), 0)
  );
  const isaiahPayout = roundToCents(Math.max(0, cashTotal - payoutTotal));
  const ccsElectronic = roundToCents(stripeTotal - venueCost);
  const allocationsTotal = roundToCents(venueCost + payoutTotal + isaiahPayout + ccsElectronic);
  const reconciliationDiff = roundToCents(totalRevenue - allocationsTotal);

  return {
    totalRevenue,
    payoutTotal,
    isaiahPayout,
    ccsElectronic,
    allocationsTotal,
    reconciliationDiff,
  };
}

export function validateClassPayoutTotal(
  payoutTotal: number,
  cashTotal: number
): string | null {
  if (payoutTotal > cashTotal + 0.0001) {
    return `Payouts ($${payoutTotal.toFixed(2)}) exceed available cash ($${cashTotal.toFixed(2)}).`;
  }
  return null;
}
