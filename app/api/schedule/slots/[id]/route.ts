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

function isAdmin(role: string | null): boolean {
  return (role || "").toLowerCase() === "admin";
}

/**
 * GET - Fetch a single slot with event and assignee.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const roleLower = (profile?.role || "").toLowerCase();
    const allowed = roleLower === "admin" || roleLower === "instructor" || roleLower.includes("instructor");
    if (!profile || !allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const { data: slot, error } = await supabaseServer
      .from("team_slots")
      .select("id, position, event_id, assignee_id, assigned_at, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error || !slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    const [eventRes, assigneeRes] = await Promise.all([
      supabaseServer.from("events").select("id, title, starts_at, location").eq("id", slot.event_id).single(),
      slot.assignee_id
        ? supabaseServer.from("profiles").select("id, first_name, last_name, email").eq("id", slot.assignee_id).single()
        : { data: null },
    ]);

    return NextResponse.json({
      slot: {
        ...slot,
        event: eventRes.data || null,
        assignee: assigneeRes.data || null,
      },
    });
  } catch (e: any) {
    console.error("Schedule slot GET:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT - Admin: assign or unassign an instructor to/from the slot.
 * Body: { assignee_id: string | null }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const assigneeId = body.assignee_id === undefined ? undefined : (body.assignee_id || null);

    const update: { assignee_id?: string | null; assigned_at?: string | null } = {};
    if (assigneeId !== undefined) {
      update.assignee_id = assigneeId;
      update.assigned_at = assigneeId ? new Date().toISOString() : null;
    }

    const { data: slot, error } = await supabaseServer
      .from("team_slots")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating slot:", error);
      return NextResponse.json({ error: "Failed to update slot" }, { status: 500 });
    }

    try {
      await updateClassEventDescriptionFromSchedule(String(slot.event_id));
    } catch (syncErr) {
      console.error("Class description sync after assign:", syncErr);
    }

    // When admin assigns a user to the slot, send confirmation email to assignee and admins
    if (slot.assignee_id) {
      const { data: assigneeProfile } = await supabaseServer
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", slot.assignee_id)
        .maybeSingle();

      let assigneeEmail: string | undefined;
      if (assigneeProfile && typeof (assigneeProfile as { email?: string }).email === "string") {
        assigneeEmail = (assigneeProfile as { email: string }).email;
      }
      if (!assigneeEmail) {
        const { data: authUser } = await supabaseServer.auth.admin.getUserById(slot.assignee_id);
        assigneeEmail = authUser?.user?.email ?? undefined;
      }

      const assigneeName = assigneeProfile
        ? [assigneeProfile.first_name, assigneeProfile.last_name].filter(Boolean).join(" ") || "Instructor"
        : "Instructor";

      if (assigneeEmail) {
        try {
          await fetch(`${req.nextUrl.origin}/api/schedule/signup-confirmation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slotId: slot.id,
              assigneeId: slot.assignee_id,
              assigneeEmail,
              assigneeName,
              position: slot.position,
              eventId: slot.event_id,
            }),
          });
        } catch (emailErr) {
          console.error("Admin assign confirmation email error:", emailErr);
        }
      }
    }

    return NextResponse.json({ success: true, slot });
  } catch (e: any) {
    console.error("Schedule slot PUT:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE - Admin: delete the slot.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const { data: slotBeforeDelete } = await supabaseServer
      .from("team_slots")
      .select("event_id, assignee_id")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseServer.from("team_slots").delete().eq("id", id);

    if (error) {
      console.error("Error deleting slot:", error);
      return NextResponse.json({ error: "Failed to delete slot" }, { status: 500 });
    }

    if (slotBeforeDelete?.event_id && slotBeforeDelete?.assignee_id) {
      try {
        await updateClassEventDescriptionFromSchedule(String(slotBeforeDelete.event_id));
      } catch (syncErr) {
        console.error("Class description sync after slot delete:", syncErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Schedule slot DELETE:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
