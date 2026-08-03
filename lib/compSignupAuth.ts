import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

export interface CompSignupProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export type CompSignupAuthResult =
  | { ok: true; userId: string; profile: CompSignupProfile; token: string }
  | { ok: false; response: NextResponse };

function unauthorized(message = "Unauthorized: sign in required"): NextResponse {
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

export function extractBearerToken(req: NextRequest): string | NextResponse {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid authorization header" },
      { status: 401 }
    );
  }
  return authHeader.replace("Bearer ", "");
}

export async function requireCompSignupAuth(
  req: NextRequest
): Promise<CompSignupAuthResult> {
  const tokenOrResponse = extractBearerToken(req);
  if (tokenOrResponse instanceof NextResponse) {
    return { ok: false, response: tokenOrResponse };
  }

  const { user, error } = await getUserFromToken(tokenOrResponse);
  if (error || !user) {
    return { ok: false, response: unauthorized() };
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      response: forbidden(
        "A CCS profile is required to register. Please create an account first."
      ),
    };
  }

  return {
    ok: true,
    userId: user.id,
    profile: profile as CompSignupProfile,
    token: tokenOrResponse,
  };
}

/** Search profiles by name or email (min 2 chars). */
export async function searchProfiles(
  q: string,
  excludeProfileId?: string | null
): Promise<CompSignupProfile[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabaseServer
    .from("profiles")
    .select("id, first_name, last_name, email")
    .or(
      `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`
    )
    .limit(10);

  if (error) return [];

  return ((data ?? []) as CompSignupProfile[]).filter(
    (p) => !excludeProfileId || p.id !== excludeProfileId
  );
}

