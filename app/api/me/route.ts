import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveFinanceAccess } from "@/lib/financeAuth";

async function getUserFromToken(accessToken: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
  const { data, error } = await client.auth.getUser(accessToken);
  const user = data?.user ?? null;
  return { user, error };
}

/**
 * GET - Current user + profile in one round trip.
 * Query: ?events_near_today=1 to include minimal events for instructor Registration link.
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

    const accessToken = authHeader.replace("Bearer ", "");
    const { user, error: authError } = await getUserFromToken(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("id, first_name, last_name, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { user, profile: null },
        { status: 200 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const includeEventsNearToday = searchParams.get("events_near_today") === "1";
    const roleLower = (profile.role || "").toLowerCase();
    // Non-CCS-Instructor does not get events_near_today / Schedule (profile-only role)
    const isInstructor =
      roleLower !== "admin" &&
      roleLower !== "non-ccs-instructor" &&
      (roleLower === "instructor" || roleLower.includes("instructor"));

    let events_near_today: { id: string; starts_at: string }[] | undefined;
    if (includeEventsNearToday && isInstructor) {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const to = new Date();
      to.setDate(to.getDate() + 7);
      const { data: events } = await supabaseServer
        .from("events")
        .select("id, starts_at")
        .gte("starts_at", from.toISOString())
        .lte("starts_at", to.toISOString())
        .order("starts_at", { ascending: true });
      events_near_today = events ?? [];
    }

    const financeAccess = resolveFinanceAccess(profile.id, profile.role);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email ?? null,
        user_metadata: user.user_metadata,
      },
      profile: {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
      },
      finance_access: financeAccess,
      ...(events_near_today !== undefined && { events_near_today }),
    });
  } catch (err) {
    console.error("API /api/me error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
