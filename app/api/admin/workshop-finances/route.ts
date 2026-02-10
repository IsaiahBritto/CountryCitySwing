import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

async function getAdminFromToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error } = await client.auth.getUser(accessToken);
  return { user, error };
}

function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid authorization header" },
      { status: 401 }
    );
  }
  return authHeader.replace("Bearer ", "");
}

async function checkAdmin(accessToken: string) {
  const { user, error } = await getAdminFromToken(accessToken);
  if (error || !user) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid token" },
      { status: 401 }
    );
  }
  const { data: profile, error: profileError } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return NextResponse.json(
      { error: "User profile not found" },
      { status: 403 }
    );
  }
  const roleLower = (profile.role || "").toLowerCase();
  if (roleLower !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const token = requireAdmin(req);
    if (token instanceof NextResponse) return token;
    const authErr = await checkAdmin(token);
    if (authErr) return authErr;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id parameter" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from("workshop_finances")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) {
      console.error("workshop-finances GET:", error);
      return NextResponse.json(
        { error: "Failed to fetch workshop finances" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? null });
  } catch (e) {
    console.error("workshop-finances GET:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = requireAdmin(req);
    if (token instanceof NextResponse) return token;
    const authErr = await checkAdmin(token);
    if (authErr) return authErr;

    const body = await req.json();
    const {
      event_id: eventId,
      studio_cost: studioCost,
      total_override: totalOverride,
      guest_instructor_amount: guestInstructorAmount,
      ccs_amount: ccsAmount,
    } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: existing } = await supabaseServer
      .from("workshop_finances")
      .select("id, studio_cost, total_override, guest_instructor_amount, ccs_amount")
      .eq("event_id", eventId)
      .maybeSingle();

    const updates: Record<string, unknown> = {
      updated_at: now,
    };

    if (typeof studioCost === "number" && studioCost >= 0) updates.studio_cost = studioCost;
    if ("total_override" in body) updates.total_override = typeof totalOverride === "number" ? totalOverride : null;
    if ("guest_instructor_amount" in body) updates.guest_instructor_amount = typeof guestInstructorAmount === "number" ? guestInstructorAmount : null;
    if ("ccs_amount" in body) updates.ccs_amount = typeof ccsAmount === "number" ? ccsAmount : null;

    // If guest_instructor_amount or ccs_amount are still unset, compute 90/10 from (total - studio) when we have both values
    const effectiveTotal = (updates.total_override as number | null | undefined) ?? existing?.total_override ?? null;
    const effectiveStudio = (typeof updates.studio_cost === "number" ? updates.studio_cost : null) ?? (existing?.studio_cost != null ? Number(existing.studio_cost) : null);
    if (
      effectiveTotal != null && typeof effectiveTotal === "number" &&
      effectiveStudio != null && typeof effectiveStudio === "number"
    ) {
      const remaining = Math.max(0, effectiveTotal - effectiveStudio);
      const defaultGuest = Math.round(remaining * 0.9 * 100) / 100;
      const defaultCcs = Math.round(remaining * 0.1 * 100) / 100;
      if (updates.guest_instructor_amount == null) updates.guest_instructor_amount = defaultGuest;
      if (updates.ccs_amount == null) updates.ccs_amount = defaultCcs;
    }

    let result;

    if (existing) {
      const { data, error } = await supabaseServer
        .from("workshop_finances")
        .update(updates)
        .eq("event_id", eventId)
        .select()
        .single();

      if (error) {
        console.error("workshop-finances PATCH update:", error);
        return NextResponse.json(
          { error: "Failed to update workshop finances" },
          { status: 500 }
        );
      }
      result = data;
    } else {
      const { data, error } = await supabaseServer
        .from("workshop_finances")
        .insert({
          event_id: eventId,
          studio_cost: updates.studio_cost ?? 0,
          total_override: updates.total_override ?? null,
          guest_instructor_amount: updates.guest_instructor_amount ?? null,
          ccs_amount: updates.ccs_amount ?? null,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        console.error("workshop-finances PATCH insert:", error);
        return NextResponse.json(
          { error: "Failed to create workshop finances" },
          { status: 500 }
        );
      }
      result = data;
    }

    return NextResponse.json({ data: result });
  } catch (e) {
    console.error("workshop-finances PATCH:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
