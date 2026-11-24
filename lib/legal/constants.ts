/** Shared legal / contact facts for policy pages and email footers. Attorney review required before treating as final. */

export const LEGAL_SITE_NAME = "Country City Swing";

export const LEGAL_BRAND_URL =
  (process.env.NEXT_PUBLIC_APP_URL || "https://countrycityswing.dance").replace(
    /\/$/,
    ""
  );

export const LEGAL_CONTACT_EMAIL = "contact.us@countrycityswing.dance";

export const LEGAL_PRIVACY_EMAIL = "contact.us@countrycityswing.dance";

export const LEGAL_LAST_UPDATED = "November 10, 2025";

export const LEGAL_GOVERNING_STATE = "Tennessee";

export const LEGAL_CITY_REGION = "Nashville, Tennessee, United States";

/**
 * Optional CAN-SPAM / legal mailing address. Set NEXT_PUBLIC_LEGAL_MAILING_ADDRESS
 * once counsel designates a PO Box or principal business address.
 * Do not use a rented hourly studio as the organization's mailing address without counsel approval.
 */
export const LEGAL_MAILING_ADDRESS =
  process.env.NEXT_PUBLIC_LEGAL_MAILING_ADDRESS?.trim() || null;

/** Example venue when events use Dance Nashville space — not asserted as principal place of business. */
export const LEGAL_EXAMPLE_VENUE =
  "Dance Nashville, 630 Rundle Avenue, Nashville, TN 37206 (when listed for a specific event)";

export const LEGAL_DRAFT_NOTICE =
  "This document describes Country City Swing's current website and operations. It is provided for attorney review and may be revised before it is considered final.";
