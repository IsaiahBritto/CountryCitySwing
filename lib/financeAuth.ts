import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { isSocialFinanceViewer } from "@/lib/socialFinanceAccess";
import { isSocialEventType } from "@/lib/socialScheduleSlots";

export type FinanceAccessLevel = "admin" | "social_viewer";

export type FinanceAccess = {
  userId: string;
  level: FinanceAccessLevel;
};

export type FinanceAccessResult =
  | { ok: true; access: FinanceAccess; token: string }
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

export function resolveFinanceAccess(
  userId: string,
  role: string | null | undefined
): FinanceAccessLevel | null {
  const roleLower = (role || "").toLowerCase();
  if (roleLower === "admin") return "admin";
  if (isSocialFinanceViewer(userId)) return "social_viewer";
  return null;
}

export async function getFinanceAccess(
  accessToken: string
): Promise<{ access: FinanceAccess | null; error?: NextResponse }> {
  const { user, error } = await getUserFromToken(accessToken);
  if (error || !user) {
    return { access: null, error: unauthorized() };
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { access: null, error: forbidden("User profile not found") };
  }

  const level = resolveFinanceAccess(user.id, profile.role);
  if (!level) {
    return { access: null, error: forbidden("Forbidden: Finance access required") };
  }

  return { access: { userId: user.id, level } };
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

export async function assertSocialEvent(
  eventId: string
): Promise<NextResponse | null> {
  const { data: eventRow, error } = await supabaseServer
    .from("events")
    .select("type")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !eventRow) {
    return forbidden("Event not found");
  }
  if (!isSocialEventType(eventRow.type)) {
    return forbidden("Forbidden: Social event access only");
  }
  return null;
}

type RequireFinanceAuthOptions = {
  requireAdmin?: boolean;
  eventId?: string;
};

export async function requireFinanceAuth(
  req: NextRequest,
  opts: RequireFinanceAuthOptions = {}
): Promise<FinanceAccessResult> {
  const tokenOrResponse = extractBearerToken(req);
  if (tokenOrResponse instanceof NextResponse) {
    return { ok: false, response: tokenOrResponse };
  }

  const { access, error } = await getFinanceAccess(tokenOrResponse);
  if (error || !access) {
    return { ok: false, response: error ?? forbidden("Forbidden: Finance access required") };
  }

  if (opts.requireAdmin && access.level !== "admin") {
    return {
      ok: false,
      response: forbidden("Forbidden: Admin access required"),
    };
  }

  if (access.level === "social_viewer" && opts.eventId) {
    const socialErr = await assertSocialEvent(opts.eventId);
    if (socialErr) return { ok: false, response: socialErr };
  }

  return { ok: true, access, token: tokenOrResponse };
}
