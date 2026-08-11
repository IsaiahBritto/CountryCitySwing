export const PLANNED_CLASS_LEVELS = [
  "beginner_side",
  "lower_level",
  "upper_level",
] as const;

export type PlannedClassLevel = (typeof PLANNED_CLASS_LEVELS)[number];

export const PLANNED_CLASS_LEVEL_LABELS: Record<PlannedClassLevel, string> = {
  beginner_side: "Beginner Side",
  lower_level: "Lower Level",
  upper_level: "Upper Level",
};

export const PLANNED_CLASS_LEVEL_DESCRIPTIONS: Record<PlannedClassLevel, string> =
  {
    beginner_side:
      "This class is focused on foundational principles for Country Swing. If you are new to formal Country Swing classes, this is the class for you to learn the foundation of the dance.",
    lower_level:
      "This class focuses on bringing you something new each week that is geared towards if you have just moved out of the Beginner Classes and up until the point of you competing in a Sanctioned Intermediate level competition and at least regularly making semis.",
    upper_level:
      "This class focuses on more advanced moves/techniques needed to launch your dance and stand out in the Advanced competitions. This class is open to those who regularly make finals in a Sanctioned Intermediate level competition and up.",
  };

export const PLANNED_CLASS_LEVEL_NOTE =
  "This selection does not lock you into taking the class and is just for general information purposes. You may choose a different level when classes split, however, you may not move up to a level which you currently don't meet the requirements.";

export function isPlannedClassLevel(value: unknown): value is PlannedClassLevel {
  return (
    typeof value === "string" &&
    (PLANNED_CLASS_LEVELS as readonly string[]).includes(value)
  );
}

export function plannedClassLevelLabel(value: unknown): string | null {
  if (!isPlannedClassLevel(value)) return null;
  return PLANNED_CLASS_LEVEL_LABELS[value];
}

const LEVEL_STYLES: Record<PlannedClassLevel, string> = {
  beginner_side: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200",
  lower_level: "border-sky-400/60 bg-sky-500/15 text-sky-100",
  upper_level: "border-indigo-400/60 bg-indigo-500/15 text-indigo-200",
};

export function plannedClassLevelBadgeClass(level: PlannedClassLevel): string {
  return LEVEL_STYLES[level];
}

const LEVEL_MODAL_STYLES: Record<PlannedClassLevel, string> = {
  beginner_side: "border-emerald-500 bg-neutral-900",
  lower_level: "border-sky-400 bg-neutral-900",
  upper_level: "border-indigo-500 bg-neutral-900",
};

export function plannedClassLevelModalClass(level: PlannedClassLevel): string {
  return LEVEL_MODAL_STYLES[level];
}

export type ClassLevelRosterEntry = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  checked_in: boolean;
  class_signup_count?: number;
};

export type ClassLevelCounts = {
  total: number;
  checked_in: number;
};

export type ClassLevelSummary = {
  counts: Record<PlannedClassLevel, ClassLevelCounts>;
  roster: Record<PlannedClassLevel, ClassLevelRosterEntry[]>;
};

export function normalizeSignupEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

export function applyClassSignupCounts(
  summary: ClassLevelSummary,
  countsByEmail: Map<string, number>
): ClassLevelSummary {
  const roster = Object.fromEntries(
    PLANNED_CLASS_LEVELS.map((level) => [
      level,
      summary.roster[level].map((entry) => ({
        ...entry,
        class_signup_count:
          countsByEmail.get(normalizeSignupEmail(entry.email) ?? "") ?? 0,
      })),
    ])
  ) as ClassLevelSummary["roster"];

  return { ...summary, roster };
}

/** @deprecated Use applyClassSignupCounts */
export const applyClassCheckInCounts = applyClassSignupCounts;

/** Aggregate class signup rows by normalized email. */
export function countClassSignupsByEmail(
  rows: Array<{ email: string | null | undefined }>,
  targetEmails: Iterable<string>
): Map<string, number> {
  const counts = new Map<string, number>();
  const targets = new Set(
    [...targetEmails]
      .map((email) => normalizeSignupEmail(email))
      .filter((email): email is string => email != null)
  );
  if (targets.size === 0) return counts;

  for (const row of rows) {
    const email = normalizeSignupEmail(row.email);
    if (!email || !targets.has(email)) continue;
    counts.set(email, (counts.get(email) ?? 0) + 1);
  }

  return counts;
}

/** @deprecated Use countClassSignupsByEmail */
export const countClassCheckInsByEmail = countClassSignupsByEmail;

export function computeClassLevelSummary(
  signups: Array<{
    id: string | number;
    first_name: string;
    last_name: string;
    email: string;
    checked_in?: boolean | null;
    planned_class_level?: string | null;
  }>
): ClassLevelSummary {
  const counts = Object.fromEntries(
    PLANNED_CLASS_LEVELS.map((level) => [level, { total: 0, checked_in: 0 }])
  ) as Record<PlannedClassLevel, ClassLevelCounts>;
  const roster = Object.fromEntries(
    PLANNED_CLASS_LEVELS.map((level) => [level, [] as ClassLevelRosterEntry[]])
  ) as Record<PlannedClassLevel, ClassLevelRosterEntry[]>;

  for (const signup of signups) {
    if (!isPlannedClassLevel(signup.planned_class_level)) continue;
    const level = signup.planned_class_level;
    counts[level].total += 1;
    if (signup.checked_in === true) counts[level].checked_in += 1;
    roster[level].push({
      id: String(signup.id),
      first_name: signup.first_name,
      last_name: signup.last_name,
      email: signup.email,
      checked_in: signup.checked_in === true,
    });
  }

  for (const level of PLANNED_CLASS_LEVELS) {
    roster[level].sort((a, b) =>
      a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" })
    );
  }

  return { counts, roster };
}
