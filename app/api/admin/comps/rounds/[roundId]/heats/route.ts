import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

/** POST: randomize entries into heats. Body: { heat_count } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;
  const body = await req.json();
  const heatCount = Math.max(1, Number(body.heat_count) || 1);

  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (!["pending", "checkin"].includes(round.status)) {
    return NextResponse.json(
      { error: "Heats can only be changed before scoring opens" },
      { status: 409 }
    );
  }

  const { data: entries } = await supabaseServer
    .from("comp_round_entries")
    .select("id")
    .eq("round_id", roundId)
    .eq("scratched", false);
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "No entries to assign" }, { status: 409 });
  }

  await supabaseServer.from("comp_heats").delete().eq("round_id", roundId);

  const { data: heats, error: heatsError } = await supabaseServer
    .from("comp_heats")
    .insert(
      Array.from({ length: heatCount }, (_, i) => ({
        round_id: roundId,
        heat_number: i + 1,
      }))
    )
    .select("*");
  if (heatsError || !heats) {
    return NextResponse.json({ error: "Failed to create heats" }, { status: 500 });
  }

  // Fisher-Yates shuffle, then round-robin into heats for balanced sizes.
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (let i = 0; i < shuffled.length; i++) {
    const heat = heats[i % heatCount];
    const { error } = await supabaseServer
      .from("comp_round_entries")
      .update({ heat_id: heat.id, dance_order: Math.floor(i / heatCount) + 1 })
      .eq("id", shuffled[i].id);
    if (error) {
      return NextResponse.json(
        { error: "Failed to assign heats" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ heats: heats.length, assigned: shuffled.length });
}
