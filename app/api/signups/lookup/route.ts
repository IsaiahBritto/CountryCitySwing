import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseCheckInToken } from "@/lib/utils/qrCheckIn";

async function getUserFromToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return { user: null, error: { message: "Auth not configured" } };
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  try {
    const { data: { user }, error } = await client.auth.getUser(accessToken);
    return { user, error };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Auth request failed";
    return { user: null, error: { message } };
  }
}

/** GET /api/signups/lookup?token=ccs:s:<id> or token=ccs:c:<id> — returns one signup for QR check-in (instructor/admin only). */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized: Missing or invalid authorization header" }, { status: 401 });
    }
    const accessToken = authHeader.replace("Bearer ", "");
    const { user, error: authError } = await getUserFromToken(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 403 });
    }
    const roleLower = (profile.role || "").toLowerCase();
    const allowed = roleLower === "admin" || roleLower === "instructor" || roleLower.includes("instructor");
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden: Admin or instructor access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Missing token parameter" }, { status: 400 });
    }

    const parsed = parseCheckInToken(token);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
    }

    if (parsed.type === "event") {
      const { data, error } = await supabaseServer
        .from("signups")
        .select("id,event_id,event_title,first_name,last_name,email,payment_method,paid,checked_in,checked_in_at")
        .eq("id", parsed.id)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Registration not found" }, { status: 404 });
      }
      return NextResponse.json({ signup: data, isComp: false });
    }

    const { data, error } = await supabaseServer
      .from("comp_signups")
      .select(
        "id,event_id,event_title,strictly_selected,strictly_lead_first_name,strictly_lead_last_name,strictly_follow_first_name,strictly_follow_last_name,jnj_selected,jnj_lead_first_name,jnj_lead_last_name,payment_method,amount_owed,paid,checked_in,checked_in_at"
      )
      .eq("id", parsed.id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }
    return NextResponse.json({ signup: data, isComp: true });
  } catch (err: any) {
    console.error("Signups lookup error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
