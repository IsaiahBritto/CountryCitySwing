import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { roundOrderForType } from "@/lib/comps/roundChain";

/**
 * POST: JnJ finals random draw. Pairs the advancing leads with the advancing
 * follows from the two tabulated callback rounds, creates couple entries
 * (keyed to the leader's bib), and creates the finals round seeded with them.
 * Body: lead_round_id, follow_round_id
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const body = await req.json();
  const leadRoundId = body.lead_round_id;
  const followRoundId = body.follow_round_id;
  if (!leadRoundId || !followRoundId) {
    return NextResponse.json(
      { error: "lead_round_id and follow_round_id are required" },
      { status: 400 }
    );
  }

  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("id, comp_type")
    .eq("id", competitionId)
    .maybeSingle();
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }
  if (competition.comp_type !== "jack_and_jill") {
    return NextResponse.json(
      { error: "The random draw only applies to Jack & Jill" },
      { status: 400 }
    );
  }

  async function advancers(roundId: string) {
    const { data: round } = await supabaseServer
      .from("comp_rounds")
      .select("id, status, judged_role, competition_id")
      .eq("id", roundId)
      .maybeSingle();
    if (!round || round.competition_id !== competitionId) return null;
    if (round.status !== "tabulated" && round.status !== "published") {
      return { error: "Both source rounds must be tabulated first" };
    }
    const { data: results } = await supabaseServer
      .from("comp_round_results")
      .select(
        "advanced, round_entry:comp_round_entries(entry_id, entry:comp_entries(*))"
      )
      .eq("round_id", roundId)
      .eq("advanced", true);
    return {
      judgedRole: round.judged_role,
      entries: ((results ?? []) as any[])
        .map((r) => r.round_entry?.entry)
        .filter(Boolean),
    };
  }

  const [leads, follows] = await Promise.all([
    advancers(leadRoundId),
    advancers(followRoundId),
  ]);
  if (!leads || !follows) {
    return NextResponse.json({ error: "Source round not found" }, { status: 404 });
  }
  if ("error" in leads) return NextResponse.json(leads, { status: 409 });
  if ("error" in follows) return NextResponse.json(follows, { status: 409 });
  if (leads.judgedRole !== "lead" || follows.judgedRole !== "follow") {
    return NextResponse.json(
      { error: "Rounds must be the leads and follows callback rounds respectively" },
      { status: 400 }
    );
  }
  if (leads.entries.length !== follows.entries.length) {
    return NextResponse.json(
      {
        error: `Lead and follow counts differ (${leads.entries.length} vs ${follows.entries.length}); promote alternates or adjust before the draw`,
      },
      { status: 409 }
    );
  }
  if (leads.entries.length === 0) {
    return NextResponse.json({ error: "No advancers to pair" }, { status: 409 });
  }

  // Fisher-Yates shuffle of the follows against dance-order leads.
  const shuffledFollows = [...follows.entries];
  for (let i = shuffledFollows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledFollows[i], shuffledFollows[j]] = [
      shuffledFollows[j],
      shuffledFollows[i],
    ];
  }

  const coupleRows = leads.entries.map((lead: any, i: number) => {
    const follow = shuffledFollows[i];
    return {
      competition_id: competitionId,
      entry_kind: "couple",
      lead_first_name: lead.lead_first_name,
      lead_last_name: lead.lead_last_name,
      lead_email: lead.lead_email,
      follow_first_name: follow.follow_first_name,
      follow_last_name: follow.follow_last_name,
      follow_email: follow.follow_email,
      // Judged off the leader's bib in finals.
      lead_bib_id: lead.lead_bib_id,
      follow_bib_id: follow.follow_bib_id,
      source_lead_entry_id: lead.id,
      source_follow_entry_id: follow.id,
    };
  });

  const { data: couples, error: couplesError } = await supabaseServer
    .from("comp_entries")
    .insert(coupleRows)
    .select("id");
  if (couplesError) {
    console.error("[admin/comps/draw] couple insert failed", couplesError);
    return NextResponse.json(
      { error: "Failed to create drawn couples" },
      { status: 500 }
    );
  }

  const { data: existingFinal } = await supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("competition_id", competitionId)
    .eq("round_type", "final")
    .is("judged_role", null)
    .maybeSingle();

  if (existingFinal && existingFinal.status !== "pending") {
    return NextResponse.json(
      { error: "Finals have already started" },
      { status: 409 }
    );
  }

  let finalsRound;
  if (existingFinal) {
    const { data, error: updateError } = await supabaseServer
      .from("comp_rounds")
      .update({
        scoring_mode: "relative_placement",
        round_order: roundOrderForType("final"),
        source_round_id: leadRoundId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingFinal.id)
      .select("*")
      .single();
    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update finals round" },
        { status: 500 }
      );
    }
    finalsRound = data;
    await supabaseServer
      .from("comp_round_entries")
      .delete()
      .eq("round_id", existingFinal.id);
  } else {
    const { data, error: roundError } = await supabaseServer
      .from("comp_rounds")
      .insert([
        {
          competition_id: competitionId,
          round_type: "final",
          judged_role: null,
          scoring_mode: "relative_placement",
          round_order: roundOrderForType("final"),
          source_round_id: leadRoundId,
        },
      ])
      .select("*")
      .single();
    if (roundError) {
      return NextResponse.json(
        { error: "Failed to create finals round" },
        { status: 500 }
      );
    }
    finalsRound = data;
  }

  const { error: entriesError } = await supabaseServer
    .from("comp_round_entries")
    .insert(
      (couples ?? []).map((c, i) => ({
        round_id: finalsRound.id,
        entry_id: c.id,
        dance_order: i + 1,
      }))
    );
  if (entriesError) {
    return NextResponse.json(
      { error: "Failed to seed finals entries" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    round: finalsRound,
    couples: couples?.length ?? 0,
  });
}
