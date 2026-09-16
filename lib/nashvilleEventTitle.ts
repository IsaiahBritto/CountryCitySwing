const NASHVILLE_EVENT_TITLE = "Nashville Country Swing Nights!";

export function normalizeEventTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

const NASHVILLE_EVENT_TITLE_NORMALIZED = normalizeEventTitle(NASHVILLE_EVENT_TITLE);

export const DEFAULT_UPPER_LEVEL_NAMES = "Hannah and Isaiah";
export const DEFAULT_UPPER_LEVEL_TEACHER = "Hannah Bonaguide";

export function isNashvilleNightTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return normalizeEventTitle(title) === NASHVILLE_EVENT_TITLE_NORMALIZED;
}

export function isCityLightsTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const n = normalizeEventTitle(title);
  return n.includes("city light") || n.includes("city lights");
}

export function isDnaTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const n = normalizeEventTitle(title);
  return n.includes("aftermath") || n.includes("dna");
}
