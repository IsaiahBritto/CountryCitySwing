import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCcsInstructorRole } from "@/lib/instructorProfiles";
import { supabaseServer } from "@/lib/supabaseServer";

async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { user: null };
  const token = authHeader.replace("Bearer ", "");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await client.auth.getUser(token);
  return { user };
}

function isInstructorOrAdmin(role: string | null): boolean {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "instructor" || r.includes("instructor");
}

/**
 * GET - List CCS instructors (for admin assign dropdown on Schedule).
 * Only profiles with role exactly "instructor". Caller must be instructor or admin.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !isInstructorOrAdmin(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: list } = await supabaseServer
      .from("profiles")
      .select("id, first_name, last_name, role")
      .eq("role", "instructor")
      .order("first_name", { ascending: true });

    const all = (list || [])
      .filter((p: any) => isCcsInstructorRole(p.role))
      .map((p: any) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        role: (p.role ?? "").trim(),
        displayName: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.id,
      }));

    return NextResponse.json({ instructors: all });
  } catch (e: any) {
    console.error("Schedule instructors GET:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
