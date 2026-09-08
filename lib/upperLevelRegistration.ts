import {
  type ClassLevelRosterEntry,
  type PlannedClassLevel,
} from "@/lib/classLevels";

export const DANCE_ROLES = ["lead", "follow"] as const;
export type DanceRole = (typeof DANCE_ROLES)[number];

export const DANCE_ROLE_LABELS: Record<DanceRole, string> = {
  lead: "Lead",
  follow: "Follow",
};

export function isDanceRole(value: unknown): value is DanceRole {
  return typeof value === "string" && (DANCE_ROLES as readonly string[]).includes(value);
}

export function danceRoleLabel(value: unknown): string | null {
  if (!isDanceRole(value)) return null;
  return DANCE_ROLE_LABELS[value];
}

export type UpperLevelCapacities = {
  upper_level_lead_capacity: number | null;
  upper_level_follow_capacity: number | null;
};

export type UpperLevelRoleCounts = {
  total: number;
  checked_in: number;
  roster: ClassLevelRosterEntry[];
};

export type UpperLevelRoleBreakdown = Record<DanceRole, UpperLevelRoleCounts>;

export type UpperLevelBreakdown = {
  public: UpperLevelRoleBreakdown;
  ccsTeam: UpperLevelRoleBreakdown;
  totals: UpperLevelRoleBreakdown;
  capacities: UpperLevelCapacities;
};

export type UpperLevelSignupRow = {
  id: string | number;
  first_name?: string;
  last_name?: string;
  email?: string;
  checked_in?: boolean | null;
  planned_class_level?: string | null;
  planned_dance_role?: string | null;
  is_ccs_team?: boolean | null;
  refunded_or_cancelled?: string | null;
};

function emptyRoleCounts(): UpperLevelRoleCounts {
  return { total: 0, checked_in: 0, roster: [] };
}

function emptyRoleBreakdown(): UpperLevelRoleBreakdown {
  return {
    lead: emptyRoleCounts(),
    follow: emptyRoleCounts(),
  };
}

function isActiveSignup(row: UpperLevelSignupRow): boolean {
  return String(row.refunded_or_cancelled || "active") !== "cancelled";
}

function toRosterEntry(row: UpperLevelSignupRow): ClassLevelRosterEntry {
  return {
    id: String(row.id),
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    email: row.email ?? "",
    checked_in: row.checked_in === true,
    planned_dance_role: isDanceRole(row.planned_dance_role)
      ? row.planned_dance_role
      : undefined,
    is_ccs_team: row.is_ccs_team === true,
  };
}

function addToBreakdown(
  breakdown: UpperLevelRoleBreakdown,
  role: DanceRole,
  row: UpperLevelSignupRow
) {
  breakdown[role].total += 1;
  if (row.checked_in === true) breakdown[role].checked_in += 1;
  breakdown[role].roster.push(toRosterEntry(row));
}

function sortRoster(breakdown: UpperLevelRoleBreakdown) {
  for (const role of DANCE_ROLES) {
    breakdown[role].roster.sort((a, b) =>
      a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" })
    );
  }
}

export function computeUpperLevelBreakdown(
  signups: UpperLevelSignupRow[],
  capacities: UpperLevelCapacities = {
    upper_level_lead_capacity: null,
    upper_level_follow_capacity: null,
  }
): UpperLevelBreakdown {
  const publicBreakdown = emptyRoleBreakdown();
  const ccsTeamBreakdown = emptyRoleBreakdown();
  const totals = emptyRoleBreakdown();

  for (const signup of signups) {
    if (signup.planned_class_level !== "upper_level") continue;
    if (!isActiveSignup(signup)) continue;
    if (!isDanceRole(signup.planned_dance_role)) continue;

    const role = signup.planned_dance_role;
    addToBreakdown(totals, role, signup);
    if (signup.is_ccs_team === true) {
      addToBreakdown(ccsTeamBreakdown, role, signup);
    } else {
      addToBreakdown(publicBreakdown, role, signup);
    }
  }

  sortRoster(publicBreakdown);
  sortRoster(ccsTeamBreakdown);
  sortRoster(totals);

  return {
    public: publicBreakdown,
    ccsTeam: ccsTeamBreakdown,
    totals,
    capacities,
  };
}

export function countUpperLevelTowardCapacity(
  signups: UpperLevelSignupRow[],
  role: DanceRole,
  opts?: { excludeSignupId?: string | number }
): number {
  const excludeId =
    opts?.excludeSignupId != null ? String(opts.excludeSignupId) : null;
  let count = 0;
  for (const signup of signups) {
    if (excludeId && String(signup.id) === excludeId) continue;
    if (signup.planned_class_level !== "upper_level") continue;
    if (!isActiveSignup(signup)) continue;
    if (signup.is_ccs_team === true) continue;
    if (signup.planned_dance_role !== role) continue;
    count += 1;
  }
  return count;
}

export function parseUpperLevelCapacity(
  value: unknown
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function getUpperLevelCapacityForRole(
  event: UpperLevelCapacities,
  role: DanceRole
): number | null {
  return role === "lead"
    ? parseUpperLevelCapacity(event.upper_level_lead_capacity)
    : parseUpperLevelCapacity(event.upper_level_follow_capacity);
}

export function isUpperLevelRoleFull(
  event: UpperLevelCapacities,
  currentCount: number,
  role: DanceRole
): boolean {
  const capacity = getUpperLevelCapacityForRole(event, role);
  if (capacity == null) return false;
  return currentCount >= capacity;
}

export function validatePlannedClassAndRole(input: {
  allThreeClasses: boolean;
  plannedClassLevel: PlannedClassLevel | null;
  plannedDanceRole: DanceRole | null;
}): { ok: true } | { ok: false; error: string } {
  if (!input.allThreeClasses) {
    if (input.plannedClassLevel != null || input.plannedDanceRole != null) {
      return { ok: false, error: "Class level selection is not required for this event." };
    }
    return { ok: true };
  }

  if (!input.plannedClassLevel) {
    return { ok: false, error: "Please select which class you plan on taking." };
  }

  if (input.plannedClassLevel === "upper_level") {
    if (!input.plannedDanceRole) {
      return { ok: false, error: "Please select whether you are a Lead or Follow for Upper Level." };
    }
    return { ok: true };
  }

  if (input.plannedDanceRole != null) {
    return { ok: false, error: "Lead/Follow selection is only required for Upper Level." };
  }

  return { ok: true };
}
