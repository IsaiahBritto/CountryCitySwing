/** Division levels for Strictly and Jack & Jill comp events. */

/** DNA brand green (Dance Nash Aftermath) — TN State comp styling */
export const DNA_GREEN_HEX = "#2BC929";
export const DNA_GREEN_BRIGHT_HEX = "#32e032";

/** TN State winners UI (comps hub + archive) */
export const tnStateFeaturedShellClass =
  "mb-8 rounded-2xl border border-[#2BC929]/40 bg-gradient-to-b from-[#2BC929]/10 to-neutral-900/40 p-4 sm:p-5";
export const tnStateHeadingClass =
  "text-sm font-semibold uppercase tracking-wide text-[#2BC929]";
export const tnStateLinkClass =
  "text-sm font-medium text-[#2BC929] hover:text-[#32e032] hover:underline";
export const tnStateCardLinkClass =
  "block rounded-xl border border-[#2BC929]/30 bg-[#2BC929]/10 p-4 transition hover:border-[#2BC929]/60 hover:bg-[#2BC929]/15";
export const tnStateMutedTextClass = "text-sm text-[#2BC929]/80";
export const tnStateCompNameClass = "font-semibold text-[#32e032]";
export const tnStateToggleShellClass =
  "flex w-full max-w-md rounded-md border border-[#2BC929]/40 bg-[#2BC929]/5 p-px";
export const tnStateToggleActiveClass =
  "flex-1 rounded-[5px] border border-[#2BC929]/50 bg-[#2BC929]/20 px-3 py-1.5 text-center text-sm font-semibold leading-tight text-[#32e032]";
export const tnStateToggleInactiveClass =
  "flex-1 rounded-[5px] border border-transparent px-3 py-1.5 text-center text-sm font-medium leading-tight text-[#2BC929]/70 transition hover:text-[#32e032]";

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
  "TN State": "border-[#2BC929]/60 bg-[#2BC929]/15 text-[#2BC929]",
  "Lower Level": "border-teal-400/60 bg-teal-500/15 text-teal-200",
  "Upper Level": "border-indigo-400/60 bg-indigo-500/15 text-indigo-200",
  Beginner: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200",
  Intermediate: "border-amber-400/60 bg-amber-500/15 text-amber-200",
  Advanced: "border-rose-400/60 bg-rose-500/15 text-rose-200",
};

export function compLevelBadgeClass(level: CompLevel): string {
  return LEVEL_STYLES[level];
}
