import { escapeHtml } from "@/lib/newsletterEmail";
import {
  LEGAL_BRAND_URL,
  LEGAL_CITY_REGION,
  LEGAL_CONTACT_EMAIL,
  LEGAL_MAILING_ADDRESS,
  LEGAL_SITE_NAME,
} from "@/lib/legal/constants";

export type MarketingEmailFooterOptions = {
  unsubscribeUrl: string;
};

/** HTML footer block for marketing email (newsletter). */
export function buildMarketingEmailFooterHtml(options: MarketingEmailFooterOptions): string {
  const privacyUrl = `${LEGAL_BRAND_URL}/privacy`;
  const addressLine = LEGAL_MAILING_ADDRESS
    ? escapeHtml(LEGAL_MAILING_ADDRESS)
    : `${escapeHtml(LEGAL_SITE_NAME)} · ${escapeHtml(LEGAL_CITY_REGION)} · Email: ${escapeHtml(LEGAL_CONTACT_EMAIL)}`;

  return (
    '<div style="margin-top:24px;padding-top:24px;border-top:1px solid #2A2A2A;text-align:center;background-color:#0D0D0D;">' +
    `<p style="color:#737373;font-size:14px;margin:0;">See you on the dance floor.</p>` +
    `<p style="color:#737373;font-size:14px;margin:8px 0 0 0;"><a href="${escapeHtml(LEGAL_BRAND_URL)}" style="color:#F2C94C;text-decoration:none;">countrycityswing.dance</a></p>` +
    `<p style="margin:12px 0 0 0;font-size:11px;color:#525252;line-height:1.5;">${addressLine}</p>` +
    `<p style="margin:8px 0 0 0;font-size:11px;color:#525252;"><a href="${escapeHtml(privacyUrl)}" style="color:#737373;text-decoration:underline;">Privacy Policy</a></p>` +
    `<p style="margin:16px 0 0 0;font-size:12px;color:#525252;"><a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#737373;text-decoration:underline;">Unsubscribe from weekly emails</a></p>` +
    "</div>"
  );
}

export function buildMarketingEmailFooterText(options: MarketingEmailFooterOptions): string[] {
  const lines = [
    "",
    "See you on the dance floor.",
    LEGAL_BRAND_URL,
  ];
  if (LEGAL_MAILING_ADDRESS) {
    lines.push(LEGAL_MAILING_ADDRESS);
  } else {
    lines.push(`${LEGAL_SITE_NAME} · ${LEGAL_CITY_REGION}`);
    lines.push(`Email: ${LEGAL_CONTACT_EMAIL}`);
  }
  lines.push(`Privacy: ${LEGAL_BRAND_URL}/privacy`);
  lines.push(`Unsubscribe: ${options.unsubscribeUrl}`);
  return lines;
}

/** Transactional email footer — no unsubscribe; includes contact and optional postal line. */
export function buildTransactionalEmailFooterHtml(): string {
  const privacyUrl = `${LEGAL_BRAND_URL}/privacy`;
  const addressLine = LEGAL_MAILING_ADDRESS
    ? escapeHtml(LEGAL_MAILING_ADDRESS)
    : `${escapeHtml(LEGAL_SITE_NAME)} · ${escapeHtml(LEGAL_CITY_REGION)}`;

  return (
    `<p style="margin-top:24px;font-size:12px;color:#666;line-height:1.5;text-align:center;">` +
    `${addressLine}<br>` +
    `Questions? <a href="mailto:${escapeHtml(LEGAL_CONTACT_EMAIL)}" style="color:#888;">${escapeHtml(LEGAL_CONTACT_EMAIL)}</a> · ` +
    `<a href="${escapeHtml(privacyUrl)}" style="color:#888;">Privacy</a>` +
    `</p>`
  );
}
