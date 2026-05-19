/** True when profile.role is exactly CCS instructor (not admin, not non-ccs-instructor). */
export function isCcsInstructorRole(role: string | null | undefined): boolean {
  return (role || "").trim().toLowerCase() === "instructor";
}
