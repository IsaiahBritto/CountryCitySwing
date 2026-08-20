import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearerToken } from "@/lib/adminAuth";
import { isMissingRelationError } from "@/lib/supabaseErrors";
import { supabaseServer } from "@/lib/supabaseServer";

export type LineDanceReviewerAuthResult =
  | {
      ok: true;
      userId: string;
      token: string;
      isAdmin: boolean;
      isReviewer: boolean;
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

/** Admin or assigned line-dance reviewer. */
export async function requireLineDanceReviewerAuth(
  req: NextRequest
): Promise<LineDanceReviewerAuthResult> {
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

  const { data: reviewerRow, error: reviewerError } = await supabaseServer
    .from("spotify_line_dance_reviewers")
    .select("profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (reviewerError && !isMissingRelationError(reviewerError)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Failed to load reviewer assignment" },
        { status: 500 }
      ),
    };
  }

  const isReviewer = !!reviewerRow;

  if (!isAdmin && !isReviewer) {
    return {
      ok: false,
      response: forbidden("Forbidden: Line dance reviewer access required"),
    };
  }

  return {
    ok: true,
    userId: user.id,
    token: tokenOrResponse,
    isAdmin,
    isReviewer,
  };
}
