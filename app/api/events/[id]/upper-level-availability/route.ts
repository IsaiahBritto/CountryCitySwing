import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  countUpperLevelTowardCapacity,
  getUpperLevelCapacityForRole,
  parseUpperLevelCapacity,
  type DanceRole,
} from "@/lib/upperLevelRegistration";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;

    const { data: event, error: eventError } = await supabaseServer
      .from("events")
      .select(
        "id,all_three_classes,upper_level_lead_capacity,upper_level_follow_capacity"
      )
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.all_three_classes !== true) {
      return NextResponse.json({
        available: false,
        reason: "not_all_three_classes",
      });
    }

    const capacities = {
      upper_level_lead_capacity: parseUpperLevelCapacity(
        event.upper_level_lead_capacity
      ),
      upper_level_follow_capacity: parseUpperLevelCapacity(
        event.upper_level_follow_capacity
      ),
    };

    const { data: signups, error: signupsError } = await supabaseServer
      .from("signups")
      .select(
        "id,planned_class_level,planned_dance_role,is_ccs_team,refunded_or_cancelled"
      )
      .eq("event_id", eventId)
      .eq("planned_class_level", "upper_level")
      .neq("refunded_or_cancelled", "cancelled");

    if (signupsError) {
      console.error("[upper-level-availability]", signupsError);
      return NextResponse.json(
        { error: "Failed to load availability" },
        { status: 500 }
      );
    }

    const roles: DanceRole[] = ["lead", "follow"];
    const availability = Object.fromEntries(
      roles.map((role) => {
        const registered = countUpperLevelTowardCapacity(signups ?? [], role);
        const capacity = getUpperLevelCapacityForRole(capacities, role);
        const remaining =
          capacity == null ? null : Math.max(0, capacity - registered);
        return [
          role,
          {
            registered,
            capacity,
            remaining,
            full: capacity != null && registered >= capacity,
          },
        ];
      })
    );

    return NextResponse.json({
      available: true,
      capacities,
      lead: availability.lead,
      follow: availability.follow,
    });
  } catch (error: unknown) {
    console.error("[upper-level-availability]", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
