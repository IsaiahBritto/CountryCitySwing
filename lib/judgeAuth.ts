import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { extractBearerToken } from "@/lib/adminAuth";

export interface JudgeAssignment {
  id: string;
  competition_id: string;
  profile_id: string;
  judge_role: "judge" | "chief_judge";
}

export type JudgeAuthResult =
  | {
      ok: true;
      userId: string;
      token: string;
      /** All competitions this user judges. */
      assignments: JudgeAssignment[];
      isAdmin: boolean;
    }
  | { ok: false; response: NextResponse };

function unauthorized(message = "Unauthorized: Invalid token"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

async function getUserFromToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(accessToken);
  return { user, error };
}

/**
 * Authenticates a request from a judge device. Succeeds when the user has at
 * least one judge assignment (optionally narrowed to one competition), or is
 * an admin (admins can act on any competition).
 */
export async function requireJudgeAuth(
  req: NextRequest,
  options: { competitionId?: string } = {}
): Promise<JudgeAuthResult> {
  const tokenOrResponse = extractBearerToken(req);
  if (tokenOrResponse instanceof NextResponse) {
    return { ok: false, response: tokenOrResponse };
  }

  const { user, error } = await getUserFromToken(tokenOrResponse);
  if (error || !user) {
    return { ok: false, response: unauthorized() };
  }

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = (profile?.role ?? "").toLowerCase() === "admin";

  let query = supabaseServer
    .from("comp_judge_assignments")
    .select("id, competition_id, profile_id, judge_role")
    .eq("profile_id", user.id);
  if (options.competitionId) {
    query = query.eq("competition_id", options.competitionId);
  }
  const { data: assignments, error: assignmentError } = await query;

  if (assignmentError) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Failed to load judge assignments" },
        { status: 500 }
      ),
    };
  }

  if ((assignments ?? []).length === 0 && !isAdmin) {
    return {
      ok: false,
      response: forbidden("Forbidden: Judge assignment required"),
    };
  }

  return {
    ok: true,
    userId: user.id,
    token: tokenOrResponse,
    assignments: (assignments ?? []) as JudgeAssignment[],
    isAdmin,
  };
}

/**
 * Verification-action gate (tabulate, resolve ties, unlock sheets, remove
 * tabulation, publish): allowed for admins and the competition's chief judge.
 */
export async function requireAdminOrChiefJudgeAuth(
  req: NextRequest,
  competitionId: string
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const chief = await requireChiefJudgeAuth(req, competitionId);
  if (chief.ok) return { ok: true, userId: chief.userId };
  return chief;
}

/**
 * Chief-judge gate for round-verification actions (unlock sheets, resolve
 * ties, remove tabulation). Admins always pass.
 */
export async function requireChiefJudgeAuth(
  req: NextRequest,
  competitionId: string
): Promise<JudgeAuthResult> {
  const auth = await requireJudgeAuth(req, { competitionId });
  if (!auth.ok) return auth;
  const isChief = auth.assignments.some(
    (a) => a.judge_role === "chief_judge" && a.competition_id === competitionId
  );
  if (!isChief && !auth.isAdmin) {
    return {
      ok: false,
      response: forbidden("Forbidden: Chief judge access required"),
    };
  }
  return auth;
}
