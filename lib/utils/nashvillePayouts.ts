/**
 * Nashville Country Swing Nights! payout logic.
 * Teacher payouts: each active Beginner Teacher 10%, Upper Level 25%. Total cannot exceed Cash.
 * Scale down equally if teacher share of profit > Cash. Remainder: Cash → Isaiah, Electronic → CCS.
 * activeBtCount 2 = BT1+BT2 (default), 3 = +BT3, 4 = +BT4. Each BT rounded to nearest dollar.
 */

export interface NashvillePayoutInput {
  cashTotal: number;
  stripeTotal: number;
  venueCost: number;
  /** Number of Beginner Teacher slots in use (2, 3, or 4). Default 2. */
  activeBtCount?: 2 | 3 | 4;
  bt1Override?: number | null;
  bt2Override?: number | null;
  bt3Override?: number | null;
  bt4Override?: number | null;
  malissaOverride?: number | null;
}

export interface NashvillePayoutResult {
  profit: number;
  teacherPayoutMax: number;
  cashAvailableForTeachers: number;
  bt1Payout: number;
  bt2Payout: number;
  bt3Payout: number;
  bt4Payout: number;
  malissaPayout: number;
  teacherPayoutTotal: number;
  scale: number;
  remainingCash: number;
  isaiahPayout: number;
  ccsElectronic: number;
  manualOverridesApplied: boolean;
  manualOverridesAdjustedToFitCash: boolean;
}

const BT_PCT = 0.1;
const MALISSA_PCT = 0.25;

/** Round to nearest dollar: down if < $0.50, up if ≥ $0.50 */
function roundToNearestDollar(x: number): number {
  return Math.round(x);
}

function roundToCents(x: number): number {
  return Math.round(x * 100) / 100;
}

export function computeNashvillePayouts(input: NashvillePayoutInput): NashvillePayoutResult {
  const {
    cashTotal,
    stripeTotal,
    venueCost,
    activeBtCount: count = 2,
    bt1Override,
    bt2Override,
    bt3Override,
    bt4Override,
    malissaOverride,
  } = input;
  const totalRevenue = cashTotal + stripeTotal;
  const profit = Math.max(0, totalRevenue - venueCost);
  const cashAvailableForTeachers = Math.max(0, cashTotal);

  const teacherPctTotal = MALISSA_PCT + count * BT_PCT;
  let bt1Payout: number;
  let bt2Payout: number;
  let bt3Payout: number;
  let bt4Payout: number;
  let malissaPayout: number;
  let scale: number;
  let teacherPayoutTotal: number;
  let manualOverridesApplied = false;
  let manualOverridesAdjustedToFitCash = false;

  const rawTeacherTotal = teacherPctTotal * profit;
  const hasOverrides =
    bt1Override != null ||
    bt2Override != null ||
    (count >= 3 && bt3Override != null) ||
    (count >= 4 && bt4Override != null) ||
    malissaOverride != null;

  const autoBt = (n: number) =>
    n <= count && profit > 0 ? roundToNearestDollar(BT_PCT * profit) : 0;

  if (hasOverrides) {
    manualOverridesApplied = true;
    bt1Payout = bt1Override != null ? Math.max(0, roundToCents(bt1Override)) : autoBt(1);
    bt2Payout = bt2Override != null ? Math.max(0, roundToCents(bt2Override)) : autoBt(2);
    bt3Payout =
      count >= 3 && bt3Override != null
        ? Math.max(0, roundToCents(bt3Override))
        : count >= 3
          ? autoBt(3)
          : 0;
    bt4Payout =
      count >= 4 && bt4Override != null
        ? Math.max(0, roundToCents(bt4Override))
        : count >= 4
          ? autoBt(4)
          : 0;
    malissaPayout =
      malissaOverride != null
        ? Math.max(0, roundToCents(malissaOverride))
        : profit <= 0
          ? 0
          : roundToNearestDollar(MALISSA_PCT * profit);

    teacherPayoutTotal = roundToCents(
      bt1Payout + bt2Payout + bt3Payout + bt4Payout + malissaPayout
    );
    scale = 1;

    if (teacherPayoutTotal > cashAvailableForTeachers) {
      manualOverridesAdjustedToFitCash = true;
      const excess = roundToCents(teacherPayoutTotal - cashAvailableForTeachers);
      malissaPayout = Math.max(0, roundToCents(malissaPayout - excess));
      teacherPayoutTotal = roundToCents(
        bt1Payout + bt2Payout + bt3Payout + bt4Payout + malissaPayout
      );
    }
  } else if (profit <= 0 || rawTeacherTotal <= 0 || cashAvailableForTeachers <= 0) {
    bt1Payout = bt2Payout = bt3Payout = bt4Payout = malissaPayout = teacherPayoutTotal = 0;
    scale = 0;
  } else if (rawTeacherTotal <= cashAvailableForTeachers) {
    scale = 1;
    bt1Payout = roundToNearestDollar(BT_PCT * profit);
    bt2Payout = roundToNearestDollar(BT_PCT * profit);
    bt3Payout = count >= 3 ? roundToNearestDollar(BT_PCT * profit) : 0;
    bt4Payout = count >= 4 ? roundToNearestDollar(BT_PCT * profit) : 0;
    malissaPayout = roundToNearestDollar(MALISSA_PCT * profit);
    teacherPayoutTotal = bt1Payout + bt2Payout + bt3Payout + bt4Payout + malissaPayout;
    if (teacherPayoutTotal > cashAvailableForTeachers) {
      const excess = teacherPayoutTotal - cashAvailableForTeachers;
      malissaPayout = Math.max(0, malissaPayout - excess);
      teacherPayoutTotal = bt1Payout + bt2Payout + bt3Payout + bt4Payout + malissaPayout;
    }
  } else {
    scale = cashAvailableForTeachers / rawTeacherTotal;
    const scaled = cashAvailableForTeachers;
    bt1Payout = roundToNearestDollar((BT_PCT / teacherPctTotal) * scaled);
    bt2Payout = roundToNearestDollar((BT_PCT / teacherPctTotal) * scaled);
    bt3Payout =
      count >= 3 ? roundToNearestDollar((BT_PCT / teacherPctTotal) * scaled) : 0;
    bt4Payout =
      count >= 4 ? roundToNearestDollar((BT_PCT / teacherPctTotal) * scaled) : 0;
    malissaPayout = roundToNearestDollar((MALISSA_PCT / teacherPctTotal) * scaled);
    teacherPayoutTotal = bt1Payout + bt2Payout + bt3Payout + bt4Payout + malissaPayout;
    if (teacherPayoutTotal > cashAvailableForTeachers) {
      const excess = teacherPayoutTotal - cashAvailableForTeachers;
      malissaPayout = Math.max(0, malissaPayout - excess);
      teacherPayoutTotal = bt1Payout + bt2Payout + bt3Payout + bt4Payout + malissaPayout;
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
    bt3Payout,
    bt4Payout,
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
