/** Shared social profile URLs (bio page, media embeds, etc.). */

export const INSTAGRAM_HANDLE =
  process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE || "countrycityswing";

export const TIKTOK_HANDLE = process.env.NEXT_PUBLIC_TIKTOK_HANDLE?.trim() || "";

export function instagramProfileUrl(): string {
  return `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
}

export function tiktokProfileUrl(): string {
  if (!TIKTOK_HANDLE) return "";
  const handle = TIKTOK_HANDLE.replace(/^@/, "");
  return `https://www.tiktok.com/@${handle}`;
}
