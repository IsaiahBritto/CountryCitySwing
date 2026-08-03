/** Division levels for Strictly and Jack & Jill comp events. */

export const COMP_LEVEL_OPTIONS = [
  "Open",
  "TN State",
  "Lower Level",
  "Upper Level",
  "Beginner",
  "Intermediate",
  "Advanced",
] as const;

export type CompLevel = (typeof COMP_LEVEL_OPTIONS)[number];

export function isCompLevel(value: unknown): value is CompLevel {
  return (
    typeof value === "string" &&
    (COMP_LEVEL_OPTIONS as readonly string[]).includes(value)
  );
}

export function parseCompLevel(value: unknown): CompLevel | null {
  return isCompLevel(value) ? value : null;
}

/** True when a comp division price is configured (0 is valid). */
export function hasCompDivisionPrice(price: number | null | undefined): boolean {
  return price != null && Number.isFinite(Number(price)) && Number(price) >= 0;
}

const LEVEL_STYLES: Record<CompLevel, string> = {
  Open: "border-sky-400/60 bg-sky-500/15 text-sky-200",
  "TN State": "border-violet-400/60 bg-violet-500/15 text-violet-200",
  "Lower Level": "border-teal-400/60 bg-teal-500/15 text-teal-200",
  "Upper Level": "border-indigo-400/60 bg-indigo-500/15 text-indigo-200",
  Beginner: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200",
  Intermediate: "border-amber-400/60 bg-amber-500/15 text-amber-200",
  Advanced: "border-rose-400/60 bg-rose-500/15 text-rose-200",
};

export function compLevelBadgeClass(level: CompLevel): string {
  return LEVEL_STYLES[level];
}
