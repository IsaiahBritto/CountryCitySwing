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

  return {
    ok: true,
    data: {
      competition: competition as PublicCompetitionResultsPayload["competition"],
      rounds: (rounds ?? []) as PublicCompetitionResultsPayload["rounds"],
    },
  };
}