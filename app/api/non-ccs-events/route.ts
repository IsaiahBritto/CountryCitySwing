import { NextRequest, NextResponse } from "next/server";
import { listPublicApprovedCommunityEvents } from "@/lib/nonCcsEventService";
import { requireAuthenticatedProfile } from "@/lib/nonCcsEventAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/dateHelpers";

/** GET: approved community comp events (public). */
export async function GET() {
  try {
    const events = await listPublicApprovedCommunityEvents();
    return NextResponse.json({ events });
  } catch (e) {
    console.error("[non-ccs-events] GET", e);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

/** POST: create draft community comp event for current user. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "New comp event";
  const starts_at =
    typeof body.starts_at === "string" ? body.starts_at : new Date().toISOString();
  const location =
    typeof body.location === "string" ? body.location.trim() : "TBD";

  const { data, error } = await supabaseServer
    .from("events")
    .insert([
      {
        title,
        starts_at,
        location,
        type: "Comp",
        host_kind: "community",
        approval_status: "draft",
        organizer_profile_id: auth.userId,
        time_zone: DEFAULT_TIME_ZONE,
        community_payment_methods: [],
      },
    ])
    .select("id, title, starts_at, approval_status")
    .single();

  if (error) {
    console.error("[non-ccs-events] POST", error);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }

  return NextResponse.json({ event: data });
}
