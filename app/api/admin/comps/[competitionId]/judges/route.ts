import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseScoringScope } from "@/lib/comps/judgeScope";
import {
  headJudgeRoleConflictMessage,
  isJudgeDesignatedHeadJudge,
} from "@/lib/comps/headJudgeValidation";
import type { ScoringScope, CompetitionRow } from "@/lib/comps/types";

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

async function loadCompetition(competitionId: string) {
  const { data } = await supabaseServer
    .from("competitions")
    .select("*")
    .eq("id", competitionId)
    .maybeSingle();
  return data as CompetitionRow | null;
}

async function enforceSingleDropsFinals(
  competitionId: string,
  dropsFinals: boolean,
  excludeAssignmentId?: string
) {
  if (!dropsFinals) return null;
  let query = supabaseServer
    .from("comp_judge_assignments")
    .select("id, judge_role")
    .eq("competition_id", competitionId)
    .eq("drops_finals", true);
  if (excludeAssignmentId) {
    query = query.neq("id", excludeAssignmentId);
  }
  const { data: existing } = await query.limit(1);
  if ((existing ?? []).length > 0) {
    return "Only one judge may be marked as dropping finals per competition";
  }
  return null;
}

function resolveScoringScope(
  compType: string,
  value: unknown
): ScoringScope {
  if (compType !== "jack_and_jill") return "both";
  return parseScoringScope(value);
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
  const dropsFinals = body.drops_finals === true;
  if (!profileId) {
    return NextResponse.json({ error: "profile_id is required" }, { status: 400 });
  }

  const competition = await loadCompetition(competitionId);
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }
  const scoringScope =
    judgeRole === "chief_judge" && competition.comp_type === "jack_and_jill"
      ? "both"
      : resolveScoringScope(competition.comp_type, body.scoring_scope);

  const dropsError = await enforceSingleDropsFinals(competitionId, dropsFinals);
  if (dropsError) {
    return NextResponse.json({ error: dropsError }, { status: 409 });
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
        scoring_scope: scoringScope,
        drops_finals: dropsFinals,
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

/** PATCH: update scoring scope or finals drop flag on an existing assignment. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const body = await req.json();
  const assignmentId = body.assignment_id;
  if (!assignmentId) {
    return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
  }

  const competition = await loadCompetition(competitionId);
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }

  const { data: existingAssignment } = await supabaseServer
    .from("comp_judge_assignments")
    .select("judge_role")
    .eq("id", assignmentId)
    .eq("competition_id", competitionId)
    .maybeSingle();

  const update: Record<string, unknown> = {};
  if (body.scoring_scope !== undefined) {
    const newScope = resolveScoringScope(
      competition.comp_type,
      body.scoring_scope
    );
    const conflict = headJudgeRoleConflictMessage(
      competition,
      assignmentId,
      newScope
    );
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }
    update.scoring_scope = newScope;
  }
  if (
    existingAssignment?.judge_role === "chief_judge" &&
    competition.comp_type === "jack_and_jill"
  ) {
    update.scoring_scope = "both";
  }
  if (body.drops_finals !== undefined) {
    const dropsFinals = body.drops_finals === true;
    const dropsError = await enforceSingleDropsFinals(
      competitionId,
      dropsFinals,
      assignmentId
    );
    if (dropsError) {
      return NextResponse.json({ error: dropsError }, { status: 409 });
    }
    update.drops_finals = dropsFinals;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("comp_judge_assignments")
    .update(update)
    .eq("id", assignmentId)
    .eq("competition_id", competitionId)
    .select("*, profile:profiles(id, first_name, last_name, email)")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to update judge assignment" },
      { status: error ? 500 : 404 }
    );
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

  const competition = await loadCompetition(competitionId);
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }

  if (isJudgeDesignatedHeadJudge(competition, assignmentId)) {
    return NextResponse.json(
      { error: "Clear head judge designation before removing this assignment" },
      { status: 409 }
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
