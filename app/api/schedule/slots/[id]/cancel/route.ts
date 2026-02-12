import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { updateClassEventDescriptionFromSchedule } from "@/lib/classDescriptionSync";

async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { user: null };
  const token = authHeader.replace("Bearer ", "");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await client.auth.getUser(token);
  return { user };
}

function isInstructorOrAdmin(role: string | null): boolean {
  const r = (role || "").trim().toLowerCase();
  if (!r) return false;
  return (
    r === "admin" ||
    r === "instructor" ||
    r.includes("instructor") ||
    r === "teacher" ||
    r.includes("teacher")
  );
}

function isAdmin(role: string | null): boolean {
  return (role || "").trim().toLowerCase() === "admin";
}

/**
 * POST - Remove current user from this slot (or admin can remove anyone).
 * Sends confirmation email to assignee and admins.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Cancel profile fetch error:", profileError);
      return NextResponse.json(
        { error: "Could not load your profile. Please try again." },
        { status: 403 }
      );
    }
    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found." },
        { status: 403 }
      );
    }
    const role = typeof profile.role === "string" ? profile.role.trim().toLowerCase() : "";
    if (!isInstructorOrAdmin(role)) {
      return NextResponse.json(
        { error: "Only instructors and admins can remove from team slots." },
        { status: 403 }
      );
    }

    const { id: slotId } = await params;

    const { data: slot, error: slotError } = await supabaseServer
      .from("team_slots")
      .select("id, position, event_id, assignee_id")
      .eq("id", slotId)
      .single();

    if (slotError || !slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    if (!slot.assignee_id) {
      return NextResponse.json(
        { error: "This slot has no assignee" },
        { status: 400 }
      );
    }

    const isAssignee = slot.assignee_id === user.id;
    const canRemove = isAssignee || isAdmin(role);
    if (!canRemove) {
      return NextResponse.json(
        { error: "You can only remove yourself from a slot, or be an admin to remove others" },
        { status: 403 }
      );
    }

    const { data: updated, error: updateError } = await supabaseServer
      .from("team_slots")
      .update({ assignee_id: null, assigned_at: null })
      .eq("id", slotId)
      .select()
      .single();

    if (updateError) {
      console.error("Error cancelling slot:", updateError);
      return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
    }

    try {
      await updateClassEventDescriptionFromSchedule(String(slot.event_id));
    } catch (syncErr) {
      console.error("Class description sync after cancel:", syncErr);
    }

    // Fetch assignee name (and email if column exists) for confirmation email
    const { data: assigneeProfile } = await supabaseServer
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", slot.assignee_id)
      .maybeSingle();

    const assigneeName = assigneeProfile
      ? [assigneeProfile.first_name, assigneeProfile.last_name].filter(Boolean).join(" ") || "Instructor"
      : "Instructor";

    let assigneeEmail: string | undefined;
    const { data: assigneeEmailRow } = await supabaseServer
      .from("profiles")
      .select("email")
      .eq("id", slot.assignee_id)
      .maybeSingle();
    if (assigneeEmailRow && typeof (assigneeEmailRow as any).email === "string") {
      assigneeEmail = (assigneeEmailRow as any).email;
    }
    if (!assigneeEmail) {
      const { data: authUser } = await supabaseServer.auth.admin.getUserById(slot.assignee_id);
      assigneeEmail = authUser?.user?.email ?? undefined;
    }

    try {
      await fetch(`${req.nextUrl.origin}/api/schedule/cancel-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: updated.id,
          assigneeId: slot.assignee_id,
          assigneeEmail: assigneeEmail || undefined,
          assigneeName,
          position: updated.position,
          eventId: updated.event_id,
        }),
      });
    } catch (emailErr) {
      console.error("Cancel confirmation email error:", emailErr);
    }

    return NextResponse.json({ success: true, slot: updated });
  } catch (e: any) {
    console.error("Schedule slot cancel:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
