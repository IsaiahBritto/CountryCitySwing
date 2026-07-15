export const LINE_DANCE_LEVELS = [
  "absolute_beginner",
  "beginner",
  "improver",
  "intermediate",
  "advanced",
  "partner",
  "other",
] as const;

export type LineDanceLevel = (typeof LINE_DANCE_LEVELS)[number];

export const LINE_DANCE_LEVEL_LABELS: Record<LineDanceLevel, string> = {
  absolute_beginner: "Absolute Beginner",
  beginner: "Beginner",
  improver: "Improver",
  intermediate: "Intermediate",
  advanced: "Advanced",
  partner: "Partner",
  other: "Other",
};

export function isLineDanceLevel(value: string): value is LineDanceLevel {
  return (LINE_DANCE_LEVELS as readonly string[]).includes(value);
}
