import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedProfile, isSiteAdmin } from "@/lib/nonCcsEventAuth";
import { supabaseServer } from "@/lib/supabaseServer";

/** GET: approval queue and recent community events (admin). */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;
  if (!isSiteAdmin(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") ?? "pending";

  let query = supabaseServer
    .from("events")
    .select(
      "id,title,starts_at,location,approval_status,submitted_at,organizer_profile_id"
    )
    .eq("host_kind", "community")
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (status === "pending") {
    query = query.eq("approval_status", "pending");
  } else if (status === "all") {
    query = query.in("approval_status", ["pending", "approved", "rejected", "draft"]);
  }

  const { data, error } = await query.limit(100);
  if (error) {
    console.error("[admin/non-ccs-events]", error);
    return NextResponse.json({ error: "Failed to load queue" }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
