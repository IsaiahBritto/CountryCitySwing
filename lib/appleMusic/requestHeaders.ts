import { NextRequest } from "next/server";

export function musicUserTokenFromRequest(req: NextRequest): string | null {
  const direct = req.headers.get("music-user-token")?.trim();
  if (direct) return direct;
  const legacy = req.headers.get("x-music-user-token")?.trim();
  return legacy || null;
}

export function storefrontFromRequest(req: NextRequest): string {
  return req.headers.get("x-apple-music-storefront")?.trim() || "us";
}

export function hashMusicUserToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) | 0;
  }
  return `u${Math.abs(hash)}`;
}
