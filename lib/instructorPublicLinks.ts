import { nameToSlug } from "@/lib/utils/slugHelpers";
import { isCcsCoreInstructor, isNonCcsInstructor } from "@/lib/instructorProfileFields";

export function instructorPublicLinks(
  firstName: string,
  lastName: string,
  role: string
): { team?: string; directory: string } {
  const slug = nameToSlug(firstName, lastName);
  const directory = `/instructors/${encodeURIComponent(slug)}`;
  if (isNonCcsInstructor(role)) {
    return { directory };
  }
  if (isCcsCoreInstructor(role)) {
    return {
      team: `/team/${encodeURIComponent(slug)}`,
      directory,
    };
  }
  return { directory };
}
