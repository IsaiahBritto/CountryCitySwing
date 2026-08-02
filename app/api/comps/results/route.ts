import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/** GET: public list of competitions that have published results. */
export async function GET() {
  const { data: rounds, error } = await supabaseServer
    .from("comp_rounds")
    .select(
      "id, competition_id, round_type, judged_role, published_at, competition:competitions(id, name, comp_type, event:events(id, title, starts_at))"
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load results" }, { status: 500 });
  }

  const byCompetition = new Map<string, any>();
  for (const round of (rounds ?? []) as any[]) {
    const comp = round.competition;
    if (!comp) continue;
    if (!byCompetition.has(comp.id)) {
      byCompetition.set(comp.id, {
        id: comp.id,
        name: comp.name,
        comp_type: comp.comp_type,
        event: comp.event,
        publishedRounds: 0,
        latestPublishedAt: round.published_at,
      });
    }
    const entry = byCompetition.get(comp.id);
    entry.publishedRounds++;
    if (round.published_at > entry.latestPublishedAt) {
      entry.latestPublishedAt = round.published_at;
    }
  }

  return NextResponse.json({ competitions: [...byCompetition.values()] });
}
