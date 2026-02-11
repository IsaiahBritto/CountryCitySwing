// lib/utils/dateHelpers.ts
export function parseLocalDate(dateStr: string) {
  if (!dateStr) return new Date(NaN);
  // Accept ISO datetime (e.g. "2026-02-15T19:00:00.000Z") or date-only "YYYY-MM-DD"
  const dateOnly = dateStr.includes("T") ? dateStr.slice(0, 10) : dateStr;
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date(NaN);
  // Local date at midnight
  return new Date(year, month - 1, day);
}
