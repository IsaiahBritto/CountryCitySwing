import { NextRequest, NextResponse } from "next/server";
import {
  loadCommunityEventForOrganizer,
  validateSubmitPayload,
} from "@/lib/nonCcsEventService";
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
  const { id } = await params;
  const admin = isSiteAdmin(auth.role);

  const event = await loadCommunityEventForOrganizer(id, auth.userId, admin);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const blocked = adminEditingOthersForbiddenResponse(
    admin,
    auth.userId,
    event.organizer_profile_id as string | null
  );
  if (blocked) return blocked;

  const err = validateSubmitPayload({
    title: event.title,
    starts_at: event.starts_at,
    location: event.location,
    community_payment_methods: event.community_payment_methods,
    competitions: event.competitions as { id: string }[],
  });
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("events")
    .update({
      approval_status: "pending",
      submitted_at: new Date().toISOString(),
      approval_rejection_reason: null,
    })
    .eq("id", id)
    .select("id, approval_status, submitted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Submit failed" }, { status: 500 });
  }

  return NextResponse.json({ event: data });
}
