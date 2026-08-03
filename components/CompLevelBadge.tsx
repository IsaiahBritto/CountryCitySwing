import { compLevelBadgeClass, isCompLevel } from "@/lib/compLevels";

export default function CompLevelBadge({
  level,
  className = "",
}: {
  level: string | null | undefined;
  className?: string;
}) {
  if (!level || !isCompLevel(level)) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${compLevelBadgeClass(level)} ${className}`}
    >
      {level}
    </span>
  );
}
