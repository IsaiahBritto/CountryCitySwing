import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { ensureSocialDoormanSlots } from "@/lib/socialScheduleSlotsServer";

// GET - Fetch all events (public)
export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("events")
      .select(
        "id,title,starts_at,ends_at,location,description,signup_link,time_zone,price,price_changes,ccs_team_price,ccs_team_price_changes,strictly_price,jnj_price,type,refund_statement"
      )
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Error fetching events:", error);
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: data || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create a new event (admin only)
export async function POST(req: NextRequest) {
  try {
    const eventData = await req.json();

    // Validate required fields
    if (!eventData.title || !eventData.starts_at || !eventData.location) {
      return NextResponse.json(
        { error: "Missing required fields: title, starts_at, location" },
        { status: 400 }
      );
    }

    // Build insert object - only include fields that exist in the table
    const insertData: any = {
      title: eventData.title,
      starts_at: eventData.starts_at,
      location: eventData.location,
    };

    // Add optional fields only if they're provided
    if (eventData.description !== undefined) insertData.description = eventData.description || null;
    if (eventData.signupLink !== undefined) insertData.signup_link = eventData.signupLink || null;
    if (eventData.price !== undefined) insertData.price = eventData.price ?? null;
    if (eventData.price_changes !== undefined) insertData.price_changes = eventData.price_changes ?? [];
    if (eventData.ccs_team_price_changes !== undefined) {
      insertData.ccs_team_price_changes = eventData.ccs_team_price_changes ?? [];
    }
    if (eventData.strictly_price !== undefined) insertData.strictly_price = eventData.strictly_price ?? null;
    if (eventData.jnj_price !== undefined) insertData.jnj_price = eventData.jnj_price ?? null;
    if (eventData.ccs_team_price !== undefined) insertData.ccs_team_price = eventData.ccs_team_price ?? null;
    if (eventData.type !== undefined) insertData.type = eventData.type || null;
    if (eventData.ends_at !== undefined) insertData.ends_at = eventData.ends_at ?? null;
    if (eventData.time_zone !== undefined) insertData.time_zone = eventData.time_zone || null;
    if (eventData.refundStatement !== undefined) {
      const text =
        typeof eventData.refundStatement === "string"
          ? eventData.refundStatement.trim()
          : "";
      insertData.refund_statement = text || null;
    } else if (eventData.refund_statement !== undefined) {
      const text =
        typeof eventData.refund_statement === "string"
          ? eventData.refund_statement.trim()
          : "";
      insertData.refund_statement = text || null;
    }

    const { data, error } = await supabaseServer
      .from("events")
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error("Error creating event:", error);
      return NextResponse.json(
        { error: "Failed to create event" },
        { status: 500 }
      );
    }

    try {
      await ensureSocialDoormanSlots(data.id, data);
    } catch (slotErr) {
      console.error("Error creating Social Doorman slots:", slotErr);
    }

    return NextResponse.json({ success: true, event: data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
