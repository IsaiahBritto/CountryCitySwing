import { NextRequest, NextResponse } from "next/server";
import {
  toCommunityCompSignupListItem,
  type CommunityCompSignupListItem,
} from "@/lib/comps/compSignupListItem";
import {
  RemoveCommunityCompSignupError,
  removeCommunityCompSignup,
} from "@/lib/comps/removeCommunityCompSignup";
import { communityEventDeleteEligibility } from "@/lib/nonCcsEventDelete";
import { loadCommunityEventForOrganizer } from "@/lib/nonCcsEventService";
import {
  adminEditingOthersForbiddenResponse,
  isSiteAdmin,
  requireAuthenticatedProfile,
} from "@/lib/nonCcsEventAuth";
import type { CompSignupRow } from "@/lib/comps/types";
import { supabaseServer } from "@/lib/supabaseServer";

type RouteParams = { params: Promise<{ id: string }> };

async function organizerAuth(req: NextRequest, eventId: string) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return { ok: false as const, response: auth.response };

  const admin = isSiteAdmin(auth.role);
  const existing = await loadCommunityEventForOrganizer(eventId, auth.userId, admin);
  if (!existing) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Event not found" }, { status: 404 }),
    };
  }
  const blocked = adminEditingOthersForbiddenResponse(
    admin,
    auth.userId,
    existing.organizer_profile_id as string | null
  );
  if (blocked) return { ok: false as const, response: blocked };

  return { ok: true as const, eventId };
}

/** GET: active comp signups for organizer delete review. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const gate = await organizerAuth(req, id);
  if (!gate.ok) return gate.response;

  const deleteMeta = await communityEventDeleteEligibility(id);
  if (deleteMeta.hasPublishedResults) {
    return NextResponse.json(
      {
        error: deleteMeta.deleteBlockReason,
        signups: [] as CommunityCompSignupListItem[],
        canDelete: false,
        signupCount: deleteMeta.signupCount,
      },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseServer
    .from("comp_signups")
    .select("*")
    .eq("event_id", id)
    .neq("refunded_or_cancelled", "cancelled")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }

  const signups = (data ?? []).map((row) =>
    toCommunityCompSignupListItem(row as CompSignupRow & { created_at?: string })
  );

  return NextResponse.json({
    signups,
    signupCount: signups.length,
    canDelete: deleteMeta.canDelete,
    deleteBlockReason: deleteMeta.deleteBlockReason,
    hasPublishedResults: false,
  });
}

/** DELETE: remove one registration (body: { signupId }). */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const gate = await organizerAuth(req, id);
  if (!gate.ok) return gate.response;

  const deleteMeta = await communityEventDeleteEligibility(id);
  if (deleteMeta.hasPublishedResults) {
    return NextResponse.json(
      { error: deleteMeta.deleteBlockReason ?? "Cannot remove registrations" },
      { status: 403 }
    );
  }

  let body: { signupId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const signupId =
    typeof body.signupId === "string" ? body.signupId.trim() : "";
  if (!signupId) {
    return NextResponse.json({ error: "signupId is required" }, { status: 400 });
  }

  try {
    await removeCommunityCompSignup(id, signupId);
  } catch (err) {
    if (err instanceof RemoveCommunityCompSignupError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("removeCommunityCompSignup", err);
    return NextResponse.json({ error: "Failed to remove registration" }, { status: 500 });
  }

  const nextMeta = await communityEventDeleteEligibility(id);
  const { data } = await supabaseServer
    .from("comp_signups")
    .select("*")
    .eq("event_id", id)
    .neq("refunded_or_cancelled", "cancelled")
    .order("created_at", { ascending: true });

  const signups = (data ?? []).map((row) =>
    toCommunityCompSignupListItem(row as CompSignupRow & { created_at?: string })
  );

  return NextResponse.json({
    success: true,
    signups,
    signupCount: signups.length,
    canDelete: nextMeta.canDelete,
    deleteBlockReason: nextMeta.deleteBlockReason,
  });
}