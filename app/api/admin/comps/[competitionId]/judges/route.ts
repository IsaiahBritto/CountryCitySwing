import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

/** GET: search profiles to assign as judges (?q=). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  await params;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ profiles: [] });

  const { data, error } = await supabaseServer
    .from("profiles")
    .select("id, first_name, last_name, email")
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10);
  if (error) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
  return NextResponse.json({ profiles: data ?? [] });
}

/** POST: assign a judge or chief judge. Judges cannot compete in this comp. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const body = await req.json();
  const profileId = body.profile_id;
  const judgeRole = body.judge_role === "chief_judge" ? "chief_judge" : "judge";
  if (!profileId) {
    return NextResponse.json({ error: "profile_id is required" }, { status: 400 });
  }

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Hard block: a competitor in this competition cannot judge it.
  const email = (profile.email ?? "").trim().toLowerCase();
  if (email) {
    const { data: conflict } = await supabaseServer
      .from("comp_entries")
      .select("id")
      .eq("competition_id", competitionId)
      .or(`lead_email.ilike.${email},follow_email.ilike.${email}`)
      .limit(1);
    if ((conflict ?? []).length > 0) {
      return NextResponse.json(
        {
          error: `${profile.first_name} ${profile.last_name} is a competitor in this competition and cannot judge it`,
        },
        { status: 409 }
      );
    }
  }

  // Only one chief judge per competition.
  if (judgeRole === "chief_judge") {
    const { data: existingCj } = await supabaseServer
      .from("comp_judge_assignments")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("judge_role", "chief_judge")
      .limit(1);
    if ((existingCj ?? []).length > 0) {
      return NextResponse.json(
        { error: "This competition already has a chief judge" },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabaseServer
    .from("comp_judge_assignments")
    .insert([
      {
        competition_id: competitionId,
        profile_id: profileId,
        judge_role: judgeRole,
      },
    ])
    .select("*, profile:profiles(id, first_name, last_name, email)")
    .single();
  if (error) {
    const message = error.code === "23505"
      ? "This person is already assigned to this competition"
      : "Failed to assign judge";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return NextResponse.json({ judge: data });
}

/** DELETE: remove a judge assignment (?assignment_id=). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const assignmentId = req.nextUrl.searchParams.get("assignment_id");
  if (!assignmentId) {
    return NextResponse.json(
      { error: "assignment_id is required" },
      { status: 400 }
    );
  }

  // Removing a judge who already scored would corrupt tabulations.
  const { data: scored } = await supabaseServer
    .from("comp_scores")
    .select("id")
    .eq("judge_assignment_id", assignmentId)
    .limit(1);
  if ((scored ?? []).length > 0) {
    return NextResponse.json(
      { error: "This judge has already entered scores and cannot be removed" },
      { status: 409 }
    );
  }

  const { error } = await supabaseServer
    .from("comp_judge_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("competition_id", competitionId);
  if (error) {
    return NextResponse.json({ error: "Failed to remove judge" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
