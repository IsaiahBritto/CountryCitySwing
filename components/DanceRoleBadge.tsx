import { danceRoleLabel, isDanceRole } from "@/lib/upperLevelRegistration";

export default function DanceRoleBadge({
  role,
  className = "",
}: {
  role: string | null | undefined;
  className?: string;
}) {
  if (!isDanceRole(role)) return null;
  const label = danceRoleLabel(role);
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md border border-violet-400/50 bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-200 ${className}`}
    >
      {label}
    </span>
  );
}
