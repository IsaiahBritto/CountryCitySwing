export const LESSON_DURATION_DEFAULTS = [45, 60] as const;

/** 15–60 minutes in 5-minute increments */
export const LESSON_DURATION_ALL: number[] = Array.from(
  { length: 10 },
  (_, i) => 15 + i * 5
);

export function isCustomLessonDuration(minutes: number): boolean {
  return !(LESSON_DURATION_DEFAULTS as readonly number[]).includes(minutes);
}

export function formatLessonDurationLabel(minutes: number): string {
  if (minutes === 60) return "1 Hour";
  return `${minutes} Minutes`;
}
