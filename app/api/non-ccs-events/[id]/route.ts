import { NextRequest, NextResponse } from "next/server";
import {
  buildCommunityEventResultsSummary,
  buildCommunityEventUpdate,
  canOrganizerEditStatus,
  loadCommunityEventForOrganizer,
  publicTabForCommunityEvent,
  publicSlugForCommunityEventId,
  resolvePublicCommunityEventRouteKey,
} from "@/lib/nonCcsEventService";
import { communityEventDeleteEligibility } from "@/lib/nonCcsEventDelete";
import { hasAnyPublishedResults } from "@/lib/comps/aggregatePublishedResults";
import { deleteEventFully } from "@/lib/events/deleteEvent";
import {
  adminEditingOthersForbiddenResponse,
  isSiteAdmin,
  requireAuthenticatedProfile,
} from "@/lib/nonCcsEventAuth";
import { supabaseServer } from "@/lib/supabaseServer";

type RouteParams = { params: Promise<{ id: string }> };

/** GET: approved event (public) or organizer/admin draft view. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: routeKey } = await params;
  const eventId = await resolvePublicCommunityEventRouteKey(routeKey);
  if (!eventId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data: event, error } = await supabaseServer
    .from("events")
    .select(
      "id,title,starts_at,ends_at,location,description,time_zone,type,host_kind,approval_status,strictly_price,jnj_price,strictly_level,jnj_level,refund_statement,community_payment_methods,community_payment_disclaimer,community_payment_disclaimer_tone,organizer_profile_id"
    )
    .eq("id", eventId)
    .eq("host_kind", "community")
    .maybeSingle();

  if (error || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.approval_status === "approved") {
    const { data: competitions } = await supabaseServer
      .from("competitions")
      .select("id, name, comp_type, status")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    const tab = publicTabForCommunityEvent(event);
    const resultsSummary = await buildCommunityEventResultsSummary(eventId);
    const hasPublishedResults = hasAnyPublishedResults(resultsSummary);
    const deleteMeta = await communityEventDeleteEligibility(eventId);
    const publicSlug =
      (await publicSlugForCommunityEventId(eventId)) ??
      event.id;
    return NextResponse.json({
      event,
      competitions: competitions ?? [],
      tab,
      hasPublishedResults,
      canDelete: deleteMeta.canDelete,
      deleteBlockReason: deleteMeta.deleteBlockReason,
      resultsSummary,
      publicSlug,
    });
  }

  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const admin = isSiteAdmin(auth.role);
  if (!admin && event.organizer_profile_id !== auth.userId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const full = await loadCommunityEventForOrganizer(eventId, auth.userId, admin);
  const deleteMeta = await communityEventDeleteEligibility(eventId);
  return NextResponse.json({
    event: full,
    competitions: full?.competitions ?? [],
    hasPublishedResults: deleteMeta.hasPublishedResults,
    canDelete: deleteMeta.canDelete,
    deleteBlockReason: deleteMeta.deleteBlockReason,
  });
}

/** PATCH: organizer edits their community event (any approval status). */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = isSiteAdmin(auth.role);

  const existing = await loadCommunityEventForOrganizer(id, auth.userId, admin);
  if (!existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const blocked = adminEditingOthersForbiddenResponse(
    admin,
    auth.userId,
    existing.organizer_profile_id as string | null
  );
  if (blocked) return blocked;

  const status = existing.approval_status as string;
  if (!canOrganizerEditStatus(status as "draft")) {
    return NextResponse.json(
      { error: "Cannot edit event in current status" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { update, error: buildErr } = buildCommunityEventUpdate(body);
  if (buildErr) {
    return NextResponse.json({ error: buildErr }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  if (status === "rejected") {
    update.approval_status = "draft";
    update.approval_rejection_reason = null;
  }

  const { data, error } = await supabaseServer
    .from("events")
    .update(update)
    .eq("id", id)
    .select("id, title, starts_at, approval_status")
    .single();

  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ event: data });
}

/** DELETE: organizer removes community event when allowed. */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = isSiteAdmin(auth.role);
  const existing = await loadCommunityEventForOrganizer(id, auth.userId, admin);
  if (!existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const blocked = adminEditingOthersForbiddenResponse(
    admin,
    auth.userId,
    existing.organizer_profile_id as string | null
  );
  if (blocked) return blocked;

  const eligibility = await communityEventDeleteEligibility(id);
  if (!eligibility.canDelete) {
    return NextResponse.json(
      { error: eligibility.deleteBlockReason ?? "Cannot delete this event" },
      { status: 409 }
    );
  }

  try {
    await deleteEventFully(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting community event:", error);
    const message =
      error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
