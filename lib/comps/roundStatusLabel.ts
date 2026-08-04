import type { RoundStatus } from "@/lib/comps/types";

/** Plain-language status for public live-comp displays. */
export function roundStatusLabel(status: string): string {
  switch (status as RoundStatus) {
    case "pending":
      return "Upcoming";
    case "checkin":
      return "Check-in open";
    case "open":
      return "On the floor";
    case "closed":
      return "Judges scoring";
    case "tabulated":
      return "Tabulating";
    case "published":
      return "Published";
    default:
      return status;
  }
}
