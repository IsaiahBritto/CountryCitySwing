import { supabaseServer } from "@/lib/supabaseServer";
import { includeTestFixtures } from "@/lib/comps/testCompAccess";
import type { NextRequest } from "next/server";

export type PublicCompetitionResultsPayload = {
  competition: {
    id: string;
    name: string;
    comp_type: string;
    status: string;
    test_comp: boolean;
    event: {
      id: string;
      title: string;
      starts_at: string | null;
      location?: string | null;
      host_kind?: string | null;
    } | null;
  };
  rounds: {
    id: string;
    round_type: string;
    judged_role: string | null;
    scoring_mode: string;
    callback_count: number | null;
    alternate_count: number | null;
    round_order: number;
    tabulation: unknown;
    published_at: string | null;
  }[];
};

export async function loadPublicCompetitionResults(
  req: NextRequest,
  competitionId: string
): Promise<
  | { ok: true; data: PublicCompetitionResultsPayload }
  | { ok: false; status: 404 | 500; error: string }
> {
  const includeTest = await includeTestFixtures(req);

  const { data: competition, error } = await supabaseServer
    .from("competitions")
    .select(
      "id, name, comp_type, status, test_comp, event:events(id, title, starts_at, location, host_kind)"
    )
    .eq("id", competitionId)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: "Failed to load competition" };
  }
  if (!competition) {
    return { ok: false, status: 404, error: "Competition not found" };
  }
  if (competition.test_comp && !includeTest) {
    return { ok: false, status: 404, error: "Competition not found" };
  }

  const { data: rounds, error: roundsError } = await supabaseServer
    .from("comp_rounds")
    .select(
      "id, round_type, judged_role, scoring_mode, callback_count, alternate_count, round_order, tabulation, published_at"
    )
    .eq("competition_id", competitionId)
    .eq("status", "published")
    .order("round_order", { ascending: true });
  if (roundsError) {
    return { ok: false, status: 500, error: "Failed to load rounds" };
  }

  const rawEvent = competition.event as
    | PublicCompetitionResultsPayload["competition"]["event"]
    | PublicCompetitionResultsPayload["competition"]["event"][]
    | null;
  const event = Array.isArray(rawEvent) ? rawEvent[0] ?? null : rawEvent ?? null;

  const payload: PublicCompetitionResultsPayload = {
    competition: {
      id: String(competition.id),
      name: String(competition.name),
      comp_type: String(competition.comp_type),
      status: String(competition.status),
      test_comp: Boolean(competition.test_comp),
      event: event
        ? {
            id: String(event.id),
            title: String(event.title),
            starts_at: event.starts_at != null ? String(event.starts_at) : null,
            location: event.location ?? null,
            host_kind: event.host_kind ?? null,
          }
        : null,
    },
    rounds: (rounds ?? []).map((r) => ({
      id: String(r.id),
      round_type: String(r.round_type),
      judged_role: r.judged_role as string | null,
      scoring_mode: String(r.scoring_mode),
      callback_count: r.callback_count as number | null,
      alternate_count: r.alternate_count as number | null,
      round_order: Number(r.round_order),
      tabulation: r.tabulation,
      published_at: r.published_at != null ? String(r.published_at) : null,
    })),
  };

  return { ok: true, data: payload };
}