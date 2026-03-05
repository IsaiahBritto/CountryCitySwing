import { createHmac } from "crypto";

const SECRET =
  process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || "";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Generate a signed token for one-click unsubscribe. */
export function signUnsubscribeToken(email: string): string {
  if (!SECRET) return "";
  const normalized = normalizeEmail(email);
  return createHmac("sha256", SECRET).update(normalized).digest("hex");
}

/** Verify token and return true if it matches the email. */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  if (!SECRET || !token) return false;
  const expected = signUnsubscribeToken(email);
  return token.length > 0 && expected === token;
}

/** Build the one-click unsubscribe URL for a given email. */
export function getUnsubscribeUrl(email: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://countrycityswing.dance";
  const normalized = encodeURIComponent(normalizeEmail(email));
  const token = signUnsubscribeToken(email);
  return `${base.replace(/\/$/, "")}/api/newsletter/unsubscribe?email=${normalized}&token=${token}`;
}
