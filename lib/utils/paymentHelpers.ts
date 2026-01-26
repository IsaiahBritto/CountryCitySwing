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
