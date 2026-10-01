import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeWeekOverride, type ClassWeekLetter } from "@/lib/classScheduleRotation";

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

function isAdmin(role: string | null): boolean {
  return (role || "").trim().toLowerCase() === "admin";
}

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

    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseServer
      .from("class_schedule_rotation_config")
      .select("anchor_date, anchor_week, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("rotation-config GET:", error);
      return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
    }

    return NextResponse.json({
      config: data ?? { anchor_date: "2025-09-29", anchor_week: "A" },
    });
  } catch (e: unknown) {
    console.error("rotation-config GET:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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

    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const anchorDate = String(body.anchor_date || "").trim();
    const anchorWeek = normalizeWeekOverride(body.anchor_week);

    if (!anchorDate || !/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
      return NextResponse.json({ error: "Invalid anchor_date (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!anchorWeek) {
      return NextResponse.json({ error: "anchor_week must be A, B, or C" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("class_schedule_rotation_config")
      .upsert(
        {
          id: 1,
          anchor_date: anchorDate,
          anchor_week: anchorWeek as ClassWeekLetter,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("anchor_date, anchor_week, updated_at")
      .single();

    if (error) {
      console.error("rotation-config PUT:", error);
      return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
    }

    return NextResponse.json({ success: true, config: data });
  } catch (e: unknown) {
    console.error("rotation-config PUT:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
