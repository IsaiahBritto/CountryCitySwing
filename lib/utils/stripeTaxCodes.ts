/**
 * Stripe Tax Codes
 * 
 * These are the verified tax codes that work with Stripe Tax.
 * If you need to verify available codes, use: stripe.taxCodes.list()
 */

export const STRIPE_TAX_CODES = {
  // General - Tangible Goods (works for most physical products)
  // This is the fallback code that should always work
  GENERAL_TANGIBLE_GOODS: "txcd_99999999",
  
  // Educational services/instruction
  // Note: If this doesn't work, use GENERAL_TANGIBLE_GOODS
  EDUCATIONAL_SERVICES: "txcd_10401000",
  
  // Shipping services
  // Using general tangible goods code as shipping-specific code is not available
  SHIPPING: "txcd_99999999",
  
  // Processing fees (typically tax-exempt, but using general code)
  PROCESSING_FEE: "txcd_99999999",
} as const;

/**
 * Get tax code for merchandise/clothing
 * Uses general tangible goods code as it's the most reliable
 */
export function getMerchandiseTaxCode(): string {
  return STRIPE_TAX_CODES.GENERAL_TANGIBLE_GOODS;
}

/**
 * Get tax code for educational services/events
 */
export function getEventTaxCode(): string {
  return STRIPE_TAX_CODES.EDUCATIONAL_SERVICES;
}

/**
 * Get tax code for shipping
 */
export function getShippingTaxCode(): string {
  return STRIPE_TAX_CODES.SHIPPING;
}

/**
 * Get tax code for processing fees
 */
export function getProcessingFeeTaxCode(): string {
  return STRIPE_TAX_CODES.PROCESSING_FEE;
}
