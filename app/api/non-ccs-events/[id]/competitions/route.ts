import { NextRequest, NextResponse } from "next/server";
import { canOrganizerEditStatus, loadCommunityEventForOrganizer } from "@/lib/nonCcsEventService";
import {
  adminEditingOthersForbiddenResponse,
  isSiteAdmin,
  requireAuthenticatedProfile,
} from "@/lib/nonCcsEventAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;
  const { id: eventId } = await params;
  const admin = isSiteAdmin(auth.role);

  const event = await loadCommunityEventForOrganizer(eventId, auth.userId, admin);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const blocked = adminEditingOthersForbiddenResponse(
    admin,
    auth.userId,
    event.organizer_profile_id as string | null
  );
  if (blocked) return blocked;

  if (!canOrganizerEditStatus(event.approval_status as "draft")) {
    return NextResponse.json({ error: "Cannot add divisions now" }, { status: 403 });
  }

  const body = await req.json();
  const compType = body.comp_type;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (
    compType !== "jack_and_jill" &&
    compType !== "strictly" &&
    compType !== "all_american"
  ) {
    return NextResponse.json(
      {
        error:
          "comp_type must be jack_and_jill, strictly, or all_american",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("competitions")
    .insert([
      {
        event_id: eventId,
        comp_type: compType,
        name,
        cj_in_panel: !!body.cj_in_panel,
        test_comp: false,
      },
    ])
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create division" }, { status: 500 });
  }
  return NextResponse.json({ competition: data });
}
