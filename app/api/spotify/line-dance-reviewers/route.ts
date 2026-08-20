import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { isMissingRelationError } from "@/lib/supabaseErrors";
import { supabaseServer } from "@/lib/supabaseServer";

type ReviewerProfileRow = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

async function loadAssignedReviewers() {
  const { data, error } = await supabaseServer
    .from("spotify_line_dance_reviewers")
    .select("profile_id, assigned_at")
    .order("assigned_at", { ascending: true });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(`Failed to load reviewers: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const profileIds = rows.map((row) => row.profile_id as string);
  const { data: profiles, error: profileError } = await supabaseServer
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", profileIds);
  if (profileError) {
    throw new Error(`Failed to load reviewer profiles: ${profileError.message}`);
  }

  const byId = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as ReviewerProfileRow & { id: string }])
  );

  return rows.map((row) => {
    const profile = byId.get(row.profile_id as string);
    return {
      profile_id: row.profile_id as string,
      assigned_at: row.assigned_at as string,
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      email: profile?.email ?? null,
    };
  });
}

/** GET: list reviewers, or search profiles (?q=). */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length >= 2) {
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

  try {
    const reviewers = await loadAssignedReviewers();
    return NextResponse.json({ reviewers });
  } catch {
    return NextResponse.json({ error: "Failed to load reviewers" }, { status: 500 });
  }
}

/** POST: assign a line-dance reviewer. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const profileId = body.profile_id;
    if (!profileId || typeof profileId !== "string") {
      return NextResponse.json({ error: "profile_id is required" }, { status: 400 });
    }

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { error } = await supabaseServer.from("spotify_line_dance_reviewers").insert([
      { profile_id: profileId, assigned_by: auth.userId },
    ]);
    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          {
            error:
              "Reviewer table not migrated yet. Apply supabase/migrations/20260820100000_line_dance_reviewers.sql",
          },
          { status: 503 }
        );
      }
      if (error.code === "23505") {
        return NextResponse.json({ error: "Already assigned as reviewer" }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to assign reviewer" }, { status: 500 });
    }

    const reviewers = await loadAssignedReviewers();
    return NextResponse.json({ reviewers });
  } catch (err) {
    console.error("Assign line dance reviewer error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to assign reviewer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE: remove reviewer assignment. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  const profileId = req.nextUrl.searchParams.get("profile_id");
  if (!profileId) {
    return NextResponse.json({ error: "profile_id is required" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("spotify_line_dance_reviewers")
    .delete()
    .eq("profile_id", profileId);
  if (error) {
    return NextResponse.json({ error: "Failed to remove reviewer" }, { status: 500 });
  }

  const reviewers = await loadAssignedReviewers();
  return NextResponse.json({ reviewers });
}
