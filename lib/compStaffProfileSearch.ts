export type StaffSearchScope = "ccs_team" | "all";

/** Matches CCS Team filter on app/team/page.tsx (excludes non-ccs-instructor). */
export function isCcsTeamProfile(role: string | null | undefined): boolean {
  const roleLower = (role ?? "").toLowerCase();
  if (roleLower === "non-ccs-instructor") return false;
  if (roleLower === "admin") return true;
  return roleLower === "instructor" || roleLower.includes("instructor");
}

export function parseStaffSearchScope(
  value: string | null | undefined
): StaffSearchScope {
  return value === "all" ? "all" : "ccs_team";
}

export function filterProfilesForStaffSearch<
  T extends { role?: string | null }
>(profiles: T[], scope: StaffSearchScope): T[] {
  if (scope === "all") return profiles;
  return profiles.filter((p) => isCcsTeamProfile(p.role));
}
