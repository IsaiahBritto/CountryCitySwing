import { NextRequest, NextResponse } from "next/server";
import { validateSubmitPayload, loadCommunityEventForOrganizer } from "@/lib/nonCcsEventService";
import { isSiteAdmin, requireAuthenticatedProfile } from "@/lib/nonCcsEventAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;
  if (!isSiteAdmin(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const event = await loadCommunityEventForOrganizer(id, auth.userId, true);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

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
      approval_status: "approved",
      approval_reviewed_at: new Date().toISOString(),
      approval_reviewed_by: auth.userId,
      approval_rejection_reason: null,
    })
    .eq("id", id)
    .eq("approval_status", "pending")
    .select("id, title, approval_status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Approve failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Event is not pending approval" },
      { status: 409 }
    );
  }

  return NextResponse.json({ event: data });
}
