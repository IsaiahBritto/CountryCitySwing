import { NextRequest, NextResponse } from "next/server";
import { requireCompAdminAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  filterProfilesForStaffSearch,
  parseStaffSearchScope,
} from "@/lib/compStaffProfileSearch";

async function loadAssignedStaff(eventId: string) {
  const { data, error } = await supabaseServer
    .from("comp_event_staff")
    .select(
      "id, profile_id, created_at, profile:profiles(id, first_name, last_name, email, role)"
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to load staff");
  return (data ?? []).map((row) => {
    const profile = (row as { profile?: Record<string, unknown> }).profile;
    return {
      id: row.id as string,
      profile_id: row.profile_id as string,
      first_name: (profile?.first_name as string | null) ?? null,
      last_name: (profile?.last_name as string | null) ?? null,
      email: (profile?.email as string | null) ?? null,
      role: (profile?.role as string | null) ?? null,
    };
  });
}

/** GET: list staff, or search profiles (?q= &scope=ccs_team|all). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireCompAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { eventId } = await params;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length >= 2) {
    const scope = parseStaffSearchScope(req.nextUrl.searchParams.get("scope"));
    const { data, error } = await supabaseServer
      .from("profiles")
      .select("id, first_name, last_name, email, role")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(20);
    if (error) {
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
    const profiles = filterProfilesForStaffSearch(data ?? [], scope).slice(0, 10);
    return NextResponse.json({ profiles });
  }

  try {
    const staff = await loadAssignedStaff(eventId);
    return NextResponse.json({ staff });
  } catch {
    return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
  }
}

/** POST: assign staff member to event. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireCompAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { eventId } = await params;
  const body = await req.json();
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

  const { error } = await supabaseServer.from("comp_event_staff").insert([
    { event_id: eventId, profile_id: profileId },
  ]);
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already assigned to this event" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to assign staff" }, { status: 500 });
  }

  const staff = await loadAssignedStaff(eventId);
  return NextResponse.json({ staff });
}

/** DELETE: remove staff assignment. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireCompAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { eventId } = await params;
  const profileId = req.nextUrl.searchParams.get("profile_id");
  if (!profileId) {
    return NextResponse.json({ error: "profile_id is required" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("comp_event_staff")
    .delete()
    .eq("event_id", eventId)
    .eq("profile_id", profileId);
  if (error) {
    return NextResponse.json({ error: "Failed to remove staff" }, { status: 500 });
  }

  const staff = await loadAssignedStaff(eventId);
  return NextResponse.json({ staff });
}
