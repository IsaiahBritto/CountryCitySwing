import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

async function getAdminFromToken(accessToken: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
  const { data: { user }, error } = await client.auth.getUser(accessToken);
  return { user, error };
}

/**
 * GET - List all profiles (admin only). Used for admin user management and Non-CCS-Instructor toggle.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid authorization header" },
        { status: 401 }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { user, error: authError } = await getAdminFromToken(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 }
      );
    }
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if ((profile?.role ?? "").toLowerCase() !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    const { data: profiles, error } = await supabaseServer
      .from("profiles")
      .select("id, first_name, last_name, email, role")
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Admin profiles GET error:", error.message);
      return NextResponse.json(
        { error: "Failed to load profiles" },
        { status: 500 }
      );
    }

    return NextResponse.json({ profiles: profiles ?? [] });
  } catch (err) {
    console.error("Admin profiles API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
