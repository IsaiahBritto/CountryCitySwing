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
