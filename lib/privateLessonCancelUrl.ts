const DEFAULT_SITE_URL = "https://countrycityswing.dance";

export function getPrivateLessonSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
}

export function buildPrivateLessonCancelUrl(cancelToken: string): string {
  const base = getPrivateLessonSiteUrl();
  return `${base}/private-lessons/cancel?token=${encodeURIComponent(cancelToken)}`;
}
