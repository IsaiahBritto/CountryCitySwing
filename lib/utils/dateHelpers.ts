// lib/utils/dateHelpers.ts
export function parseLocalDate(dateStr: string) {
  // "2026-01-20" → 2026-01-20T00:00:00 in *local* time
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}
