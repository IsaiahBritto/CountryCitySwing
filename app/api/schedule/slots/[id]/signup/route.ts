import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { updateClassEventDescriptionFromSchedule } from "@/lib/classDescriptionSync";
import { syncClassFinanceTeachersFromSchedule } from "@/lib/classFinanceSync";
import { syncSocialDoorPayoutsFromSchedule } from "@/lib/socialDoorFinanceSync";
import { isEventPastInChicago } from "@/lib/utils/dateHelpers";

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
 * POST - Sign current user up for this slot (instructor or admin).
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

    // Select only role for permission check (profiles may not have email column)
    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Signup profile fetch error:", profileError);
      return NextResponse.json(
        { error: "Could not load your profile. Please try again." },
        { status: 403 }
      );
    }
    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found. Make sure your account has a profile with role set to instructor or admin." },
        { status: 403 }
      );
    }
    const role = typeof profile.role === "string" ? profile.role.trim().toLowerCase() : "";
    if (!isInstructorOrAdmin(role)) {
      return NextResponse.json(
        { error: "Only instructors and admins can sign up for team slots. Your role is not set or not allowed." },
        { status: 403 }
      );
    }

    // Optional: get name for confirmation email (don't fail if column missing)
    const { data: profileExtra } = await supabaseServer
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    const assigneeName = profileExtra
      ? [profileExtra.first_name, profileExtra.last_name].filter(Boolean).join(" ") || "Instructor"
      : "Instructor";

    const { id: slotId } = await params;

    const { data: slot, error: slotError } = await supabaseServer
      .from("team_slots")
      .select("id, position, event_id, assignee_id")
      .eq("id", slotId)
      .single();

    if (slotError || !slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    if (slot.assignee_id) {
      return NextResponse.json(
        { error: "This slot is already assigned" },
        { status: 400 }
      );
    }

    const { data: event } = await supabaseServer
      .from("events")
      .select("starts_at, ends_at")
      .eq("id", slot.event_id)
      .maybeSingle();

    if (!isAdmin(role) && event?.starts_at && isEventPastInChicago(event.starts_at, event.ends_at)) {
      return NextResponse.json(
        { error: "This event is locked. Instructors can no longer edit assignments after the event day." },
        { status: 403 }
      );
    }

    const assignedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseServer
      .from("team_slots")
      .update({ assignee_id: user.id, assigned_at: assignedAt })
      .eq("id", slotId)
      .select()
      .single();

    if (updateError) {
      console.error("Error signing up for slot:", updateError);
      return NextResponse.json({ error: "Failed to sign up" }, { status: 500 });
    }

    try {
      await updateClassEventDescriptionFromSchedule(String(updated.event_id));
    } catch (syncErr) {
      console.error("Class description sync after signup:", syncErr);
    }
    try {
      await syncClassFinanceTeachersFromSchedule(String(updated.event_id));
    } catch (syncErr) {
      console.error("Class finance sync after signup:", syncErr);
    }
    try {
      await syncSocialDoorPayoutsFromSchedule(String(updated.event_id));
    } catch (syncErr) {
      console.error("Social door finance sync after signup:", syncErr);
    }

    // Send confirmation email (assignee + admins)
    try {
      await fetch(`${req.nextUrl.origin}/api/schedule/signup-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: updated.id,
          assigneeId: user.id,
          assigneeEmail: user.email ?? "",
          assigneeName,
          position: updated.position,
          eventId: updated.event_id,
        }),
      });
    } catch (emailErr) {
      console.error("Signup confirmation email error:", emailErr);
    }

    return NextResponse.json({ success: true, slot: updated });
  } catch (e: any) {
    console.error("Schedule slot signup:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
