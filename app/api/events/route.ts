import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// GET - Fetch all events (public)
export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("events")
      .select("*")
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
    if (eventData.strictly_price !== undefined) insertData.strictly_price = eventData.strictly_price ?? null;
    if (eventData.jnj_price !== undefined) insertData.jnj_price = eventData.jnj_price ?? null;
    if (eventData.ccs_team_price !== undefined) insertData.ccs_team_price = eventData.ccs_team_price ?? null;
    if (eventData.type !== undefined) insertData.type = eventData.type || null;

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

    return NextResponse.json({ success: true, event: data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
