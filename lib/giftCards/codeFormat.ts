export const GIFT_CARD_CODE_PREFIX = "CCS-";
export const GIFT_CARD_CODE_BODY_LENGTH = 8;

/**
 * Format what the customer typed (or pasted) into the part after "CCS-": uppercase,
 * letters/digits only, max 8 chars, dash after the 4th ("CEEW-ENVZ").
 */
export function formatGiftCardCodeBody(raw: string): string {
  let chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Pasted full code ("CCS-XXXX-XXXX"); a body may itself start with "CCS", so only strip when too long
  if (chars.length > GIFT_CARD_CODE_BODY_LENGTH && chars.startsWith("CCS")) chars = chars.slice(3);
  chars = chars.slice(0, GIFT_CARD_CODE_BODY_LENGTH);
  return chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
}

export function isCompleteGiftCardCodeBody(body: string): boolean {
  return body.replace(/[^A-Z0-9]/g, "").length === GIFT_CARD_CODE_BODY_LENGTH;
}

/** Canonical lookup form. Generated codes are rebuilt as CCS-XXXX-XXXX regardless of dash/space placement. */
export function normalizeGiftCardCodeInput(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (chars.startsWith("CCS") && chars.length === 3 + GIFT_CARD_CODE_BODY_LENGTH) {
    return `${GIFT_CARD_CODE_PREFIX}${formatGiftCardCodeBody(chars)}`;
  }
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
