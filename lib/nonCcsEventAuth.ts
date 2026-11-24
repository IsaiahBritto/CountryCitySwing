import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearerToken } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export type NonCcsAuthResult =
  | { ok: true; userId: string; token: string; role: string | null }
  | { ok: false; response: NextResponse };

async function getUserFromToken(accessToken: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
  const {
    data: { user },
    error,
  } = await client.auth.getUser(accessToken);
  return { user, error };
}

export async function requireAuthenticatedProfile(
  req: NextRequest
): Promise<NonCcsAuthResult> {
  const tokenOrResponse = extractBearerToken(req);
  if (tokenOrResponse instanceof NextResponse) {
    return { ok: false, response: tokenOrResponse };
  }

  const { user, error } = await getUserFromToken(tokenOrResponse);
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Profile not found" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: user.id,
    token: tokenOrResponse,
    role: profile.role ?? null,
  };
}

export function isSiteAdmin(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "admin";
}

/** Site admins review submissions read-only; only the organizer may mutate. */
export function adminEditingOthersForbiddenResponse(
  admin: boolean,
  userId: string,
  organizerProfileId: string | null | undefined
): NextResponse | null {
  if (admin && organizerProfileId !== userId) {
    return NextResponse.json(
      {
        error:
          "Only the event organizer can change this submission. Use the approval queue to review.",
      },
      { status: 403 }
    );
  }
  return null;
}
