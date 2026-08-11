import {
  isPlannedClassLevel,
  plannedClassLevelBadgeClass,
  plannedClassLevelLabel,
} from "@/lib/classLevels";

export default function PlannedClassLevelBadge({
  level,
  className = "",
}: {
  level: string | null | undefined;
  className?: string;
}) {
  if (!isPlannedClassLevel(level)) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${plannedClassLevelBadgeClass(level)} ${className}`}
    >
      {plannedClassLevelLabel(level)}
    </span>
  );
}
