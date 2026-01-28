/**
 * Nashville Country Swing Nights! payout logic.
 * Teacher payouts (BT1 10%, BT2 10%, Malissa 25%) cannot exceed Cash.
 * Scale down equally if 45% of profit > Cash. Remainder: Cash → Isaiah, Electronic → CCS.
 * BT1, BT2, Malissa rounded to nearest dollar (down < $0.50, up ≥ $0.50).
 */

export interface NashvillePayoutInput {
  cashTotal: number;
  stripeTotal: number;
  venueCost: number;
  bt1Override?: number | null;
  bt2Override?: number | null;
  malissaOverride?: number | null;
}

export interface NashvillePayoutResult {
  profit: number;
  teacherPayoutMax: number;
  cashAvailableForTeachers: number;
  bt1Payout: number;
  bt2Payout: number;
  malissaPayout: number;
  teacherPayoutTotal: number;
  scale: number;
  remainingCash: number;
  isaiahPayout: number;
  ccsElectronic: number;
  manualOverridesApplied: boolean;
  manualOverridesAdjustedToFitCash: boolean;
}

const BT1_PCT = 0.1;
const BT2_PCT = 0.1;
const MALISSA_PCT = 0.25;
const TEACHER_PCT_TOTAL = BT1_PCT + BT2_PCT + MALISSA_PCT;

/** Round to nearest dollar: down if < $0.50, up if ≥ $0.50 */
function roundToNearestDollar(x: number): number {
  return Math.round(x);
}

function roundToCents(x: number): number {
  return Math.round(x * 100) / 100;
}

export function computeNashvillePayouts(input: NashvillePayoutInput): NashvillePayoutResult {
  const { cashTotal, stripeTotal, venueCost, bt1Override, bt2Override, malissaOverride } = input;
  const totalRevenue = cashTotal + stripeTotal;
  const profit = Math.max(0, totalRevenue - venueCost);
  // Keep original behavior: teacher payouts are capped by cash collected (not reduced by venue cost).
  // For reconciliation, we treat venue cost as coming out of the electronic (CCS) side.
  const cashAvailableForTeachers = Math.max(0, cashTotal);

  let bt1Payout: number;
  let bt2Payout: number;
  let malissaPayout: number;
  let scale: number;
  let teacherPayoutTotal: number;
  let manualOverridesApplied = false;
  let manualOverridesAdjustedToFitCash = false;

  const rawTeacherTotal = TEACHER_PCT_TOTAL * profit;
  const hasOverrides = bt1Override != null || bt2Override != null || malissaOverride != null;

  if (hasOverrides) {
    manualOverridesApplied = true;
    const autoBt1 = profit <= 0 ? 0 : roundToNearestDollar(BT1_PCT * profit);
    const autoBt2 = profit <= 0 ? 0 : roundToNearestDollar(BT2_PCT * profit);
    const autoMalissa = profit <= 0 ? 0 : roundToNearestDollar(MALISSA_PCT * profit);

    bt1Payout = bt1Override != null ? Math.max(0, roundToCents(bt1Override)) : autoBt1;
    bt2Payout = bt2Override != null ? Math.max(0, roundToCents(bt2Override)) : autoBt2;
    malissaPayout = malissaOverride != null ? Math.max(0, roundToCents(malissaOverride)) : autoMalissa;

    teacherPayoutTotal = roundToCents(bt1Payout + bt2Payout + malissaPayout);
    scale = 1;

    if (teacherPayoutTotal > cashAvailableForTeachers) {
      manualOverridesAdjustedToFitCash = true;
      const excess = roundToCents(teacherPayoutTotal - cashAvailableForTeachers);
      malissaPayout = Math.max(0, roundToCents(malissaPayout - excess));
      teacherPayoutTotal = roundToCents(bt1Payout + bt2Payout + malissaPayout);
    }
  } else if (profit <= 0 || rawTeacherTotal <= 0 || cashAvailableForTeachers <= 0) {
    bt1Payout = bt2Payout = malissaPayout = teacherPayoutTotal = 0;
    scale = 0;
  } else if (rawTeacherTotal <= cashAvailableForTeachers) {
    scale = 1;
    bt1Payout = roundToNearestDollar(BT1_PCT * profit);
    bt2Payout = roundToNearestDollar(BT2_PCT * profit);
    malissaPayout = roundToNearestDollar(MALISSA_PCT * profit);
    teacherPayoutTotal = bt1Payout + bt2Payout + malissaPayout;
    if (teacherPayoutTotal > cashAvailableForTeachers) {
      const excess = teacherPayoutTotal - cashAvailableForTeachers;
      malissaPayout = Math.max(0, malissaPayout - excess);
      teacherPayoutTotal = bt1Payout + bt2Payout + malissaPayout;
    }
  } else {
    scale = cashAvailableForTeachers / rawTeacherTotal;
    const scaled = cashAvailableForTeachers;
    bt1Payout = roundToNearestDollar((BT1_PCT / TEACHER_PCT_TOTAL) * scaled);
    bt2Payout = roundToNearestDollar((BT2_PCT / TEACHER_PCT_TOTAL) * scaled);
    malissaPayout = roundToNearestDollar((MALISSA_PCT / TEACHER_PCT_TOTAL) * scaled);
    teacherPayoutTotal = bt1Payout + bt2Payout + malissaPayout;
    if (teacherPayoutTotal > cashAvailableForTeachers) {
      const excess = teacherPayoutTotal - cashAvailableForTeachers;
      malissaPayout = Math.max(0, malissaPayout - excess);
      teacherPayoutTotal = bt1Payout + bt2Payout + malissaPayout;
    }
  }

  const remainingCash = roundToCents(cashTotal - teacherPayoutTotal);
  const isaiahPayout = Math.max(0, remainingCash);
  const ccsElectronic = roundToCents(stripeTotal - venueCost);

  return {
    profit,
    teacherPayoutMax: Math.min(rawTeacherTotal, cashAvailableForTeachers),
    cashAvailableForTeachers,
    bt1Payout,
    bt2Payout,
    malissaPayout,
    teacherPayoutTotal,
    scale,
    remainingCash,
    isaiahPayout,
    ccsElectronic,
    manualOverridesApplied,
    manualOverridesAdjustedToFitCash,
  };
}
