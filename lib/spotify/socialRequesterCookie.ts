export const SOCIAL_REQUESTER_COOKIE = "ccs_social_requester";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function readSocialRequesterCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${SOCIAL_REQUESTER_COOKIE}=`)) continue;
    const value = trimmed.slice(SOCIAL_REQUESTER_COOKIE.length + 1);
    if (value) return decodeURIComponent(value);
  }
  return null;
}

export function socialRequesterCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SOCIAL_REQUESTER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SEC}${secure}`;
}

export function newRequesterToken(): string {
  return crypto.randomUUID();
}
