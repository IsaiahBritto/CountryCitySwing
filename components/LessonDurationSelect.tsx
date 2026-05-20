"use client";

import { useEffect, useState } from "react";
import {
  LESSON_DURATION_ALL,
  LESSON_DURATION_DEFAULTS,
  formatLessonDurationLabel,
  isCustomLessonDuration,
} from "@/lib/lessonDurationOptions";

const MORE_OPTIONS_VALUE = "more";

export default function LessonDurationSelect({
  value,
  onChange,
  className = "",
}: {
  value: number;
  onChange: (minutes: number) => void;
  className?: string;
}) {
  const [showMoreOptions, setShowMoreOptions] = useState(() =>
    isCustomLessonDuration(value)
  );

  useEffect(() => {
    if (isCustomLessonDuration(value)) {
      setShowMoreOptions(true);
    }
  }, [value]);

  if (showMoreOptions) {
    return (
      <div className="flex flex-col gap-1">
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={className}
          title="Lesson duration"
        >
          {LESSON_DURATION_ALL.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatLessonDurationLabel(minutes)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setShowMoreOptions(false);
            if (isCustomLessonDuration(value)) {
              onChange(LESSON_DURATION_DEFAULTS[0]);
            }
          }}
          className="text-xs text-yellow-400/80 hover:text-yellow-400 text-left"
        >
          ← Common durations
        </button>
      </div>
    );
  }

  return (
    <select
      value={
        (LESSON_DURATION_DEFAULTS as readonly number[]).includes(value)
          ? value
          : MORE_OPTIONS_VALUE
      }
      onChange={(e) => {
        const selected = e.target.value;
        if (selected === MORE_OPTIONS_VALUE) {
          setShowMoreOptions(true);
          if (isCustomLessonDuration(value)) return;
          onChange(value);
          return;
        }
        onChange(Number(selected));
      }}
      className={className}
      title="Lesson duration"
    >
      {LESSON_DURATION_DEFAULTS.map((minutes) => (
        <option key={minutes} value={minutes}>
          {formatLessonDurationLabel(minutes)}
        </option>
      ))}
      <option value={MORE_OPTIONS_VALUE}>More options...</option>
    </select>
  );
}
