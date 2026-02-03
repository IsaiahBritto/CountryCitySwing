/**
 * Payment calculation utilities for processing fees and tax
 */

/**
 * Calculate processing fee based on subtotal
 * Common practice is 2.9% + $0.30 (Stripe's standard rate) or a flat fee
 * You can adjust this based on your needs
 */
export function calculateProcessingFee(subtotal: number): number {
  // Option 1: Percentage-based fee (2.9% + $0.30)
  const percentageFee = subtotal * 0.029;
  const flatFee = 0.30;
  return percentageFee + flatFee;

  // Option 2: Flat fee (uncomment to use instead)
  // return 2.50; // Example: $2.50 flat fee

  // Option 3: Percentage only (uncomment to use instead)
  // return subtotal * 0.029; // 2.9% only
}

/**
 * Round to 2 decimal places (for currency)
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Get discounted subtotal (in dollars) from a Stripe coupon.
 * Coupon.amount_off is in CENTS; percent_off is 0–100.
 * Reads both snake_case (amount_off) and camelCase (amountOff) for compatibility.
 */
export function getDiscountedSubtotalFromCoupon(
  coupon: unknown,
  subtotalDollars: number
): number {
  if (!coupon || typeof coupon !== "object") return subtotalDollars;
  const c = coupon as Record<string, unknown>;
  const amountOffCents = c.amount_off ?? c.amountOff;
  const percentOff = c.percent_off ?? c.percentOff;
  if (typeof amountOffCents === "number" && Number.isFinite(amountOffCents)) {
    return Math.max(0, subtotalDollars - amountOffCents / 100);
  }
  if (typeof percentOff === "number" && Number.isFinite(percentOff)) {
    return Math.max(0, subtotalDollars * (1 - percentOff / 100));
  }
  return subtotalDollars;
}
