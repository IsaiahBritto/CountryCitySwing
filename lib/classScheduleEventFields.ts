import { normalizeWeekOverride, type ClassWeekLetter } from "@/lib/classScheduleRotation";

export function parseClassWeekOverrideInput(
  value: unknown
): ClassWeekLetter | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "auto" || value === "Auto") return null;
  return normalizeWeekOverride(String(value));
}

export function parseScheduleOpensAtInput(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}
