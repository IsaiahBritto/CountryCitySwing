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
 * Reads snake_case and camelCase; handles Stripe SDK or raw API response shape.
 * If the object is a "promotion" wrapper, reads .coupon (nested object) for amount_off/percent_off.
 */
export function getDiscountedSubtotalFromCoupon(
  coupon: unknown,
  subtotalDollars: number
): number {
  if (!coupon || typeof coupon !== "object") return subtotalDollars;
  const c = coupon as Record<string, unknown>;
  // Stripe promotion object may nest the coupon under .coupon
  const inner = c.coupon ?? c.coupon_id;
  const use = inner && typeof inner === "object" && !Array.isArray(inner) ? (inner as Record<string, unknown>) : c;
  const amountOffCents = use.amount_off ?? use.amountOff;
  const percentOff = use.percent_off ?? use.percentOff;
  const amountNum =
    typeof amountOffCents === "number" && Number.isFinite(amountOffCents)
      ? amountOffCents
      : null;
  const percentNum =
    typeof percentOff === "number" && Number.isFinite(percentOff)
      ? percentOff
      : null;
  if (amountNum != null) {
    return Math.max(0, subtotalDollars - amountNum / 100);
  }
  if (percentNum != null) {
    return Math.max(0, subtotalDollars * (1 - percentNum / 100));
  }
  return subtotalDollars;
}
