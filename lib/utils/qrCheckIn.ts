/**
 * QR code payload format for check-in: ccs:s:<signupId> (event) or ccs:c:<compSignupId> (comp).
 * Used in confirmation emails and decoded by the registration scanner.
 */
export const QR_PREFIX_EVENT = "ccs:s:";
export const QR_PREFIX_COMP = "ccs:c:";

export function eventSignupToken(signupId: string): string {
  return `${QR_PREFIX_EVENT}${signupId}`;
}

export function compSignupToken(compSignupId: string): string {
  return `${QR_PREFIX_COMP}${compSignupId}`;
}

export function parseCheckInToken(token: string): { type: "event"; id: string } | { type: "comp"; id: string } | null {
  const t = (token || "").trim();
  if (t.startsWith(QR_PREFIX_EVENT)) {
    const id = t.slice(QR_PREFIX_EVENT.length).trim();
    return id ? { type: "event", id } : null;
  }
  if (t.startsWith(QR_PREFIX_COMP)) {
    const id = t.slice(QR_PREFIX_COMP.length).trim();
    return id ? { type: "comp", id } : null;
  }
  return null;
}
