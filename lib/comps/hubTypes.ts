import type { PodiumEntry } from "@/lib/comps/podium";

export interface HubUpcomingEvent {
  id: string;
  title: string;
  starts_at: string;
  location?: string | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  strictly_level?: string | null;
  jnj_level?: string | null;
  signup_link?: string | null;
  refund_statement?: string | null;
  test_event?: boolean;
}

export interface HubLatestPublishedRound {
  round_type: string;
  judged_role: string | null;
  published_at: string | null;
}

export interface HubLiveCompetition {
  id: string;
  name: string;
  comp_type: string;
  status: string;
  test_comp?: boolean;
  event: { id: string; title: string; starts_at: string; location?: string | null } | null;
  latestPublishedRound: HubLatestPublishedRound | null;
}

export interface HubPastCompetition {
  id: string;
  name: string;
  comp_type: string;
  test_comp?: boolean;
  publishedRounds: number;
  podium: PodiumEntry[] | null;
  latestPublishedAt: string | null;
}

export interface HubPastEvent {
  id: string;
  title: string;
  starts_at: string | null;
  location: string | null;
  test_event?: boolean;
  competitions: HubPastCompetition[];
}

export interface HubPayload {
  upcoming: HubUpcomingEvent[];
  live: HubLiveCompetition[];
  past: HubPastEvent[];
}

export interface MeUpcomingDivision {
  division: "strictly" | "jack_and_jill";
  role: "lead" | "follow" | null;
}

export interface MeUpcoming {
  signupId: string;
  eventId: string;
  event: {
    id: string;
    title: string;
    starts_at: string;
    location?: string | null;
  } | null;
  bibNumber: number | null;
  divisions: MeUpcomingDivision[];
}

export interface MeCompHistory {
  competitionId: string;
  competitionName: string;
  compType: string;
  eventTitle: string | null;
  eventStartsAt: string | null;
  placement: number | null;
  role: "lead" | "follow" | null;
}

/** @deprecated Use MeCompHistory */
export type MePastPlacement = MeCompHistory;

export interface MePayload {
  upcoming: MeUpcoming[];
  history: MeCompHistory[];
}

export const COMP_TYPE_LABEL: Record<string, string> = {
  jack_and_jill: "Jack & Jill",
  strictly: "Strictly",
};

export const ROUND_TYPE_LABEL: Record<string, string> = {
  prelims: "Prelims",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

export function ordinalLabel(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}
