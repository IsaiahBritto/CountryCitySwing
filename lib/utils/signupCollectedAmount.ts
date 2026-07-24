/**
 * A1: Prefer amount_paid when set; else amount_owed; else schedule/price fallback.
 */
export function resolveCollectedTicketAmount(
  signup: {
    amount_paid?: number | null;
    amount_owed?: number | null;
  },
  fallbackPrice: number
): number {
  if (signup.amount_paid != null && Number.isFinite(Number(signup.amount_paid))) {
    return Number(signup.amount_paid);
  }
  if (signup.amount_owed != null && Number.isFinite(Number(signup.amount_owed))) {
    return Number(signup.amount_owed);
  }
  return fallbackPrice;
}
