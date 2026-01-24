import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// PUT - Update an event (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const eventData = await req.json();
    const { id: eventId } = await params;

    console.log("Updating event:", { eventId, eventData });

    // Validate required fields
    if (!eventData.title || !eventData.date || !eventData.location) {
      return NextResponse.json(
        { error: "Missing required fields: title, date, location" },
        { status: 400 }
      );
    }

    // Convert eventId to number if events table uses integer IDs
    const idToUse = isNaN(Number(eventId)) ? eventId : Number(eventId);

    // Build update object - only include fields that exist in the table
    const updateData: any = {
      title: eventData.title,
      date: eventData.date,
      location: eventData.location,
    };

    // Add optional fields only if they're provided
    if (eventData.description !== undefined) updateData.description = eventData.description || null;
    if (eventData.signupLink !== undefined) updateData.signup_link = eventData.signupLink || null;
    if (eventData.price !== undefined) updateData.price = eventData.price || null;
    if (eventData.start_time !== undefined) updateData.start_time = eventData.start_time || null;
    if (eventData.type !== undefined) updateData.type = eventData.type || null;

    const { data, error } = await supabaseServer
      .from("events")
      .update(updateData)
      .eq("id", idToUse)
      .select()
      .single();

    if (error) {
      console.error("Error updating event:", {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return NextResponse.json(
        { 
          error: "Failed to update event",
          details: error.message || "Unknown error",
          code: error.code
        },
        { status: 500 }
      );
    }

    if (!data) {
      console.error("No data returned from update");
      return NextResponse.json(
        { error: "Event not found or update returned no data" },
        { status: 404 }
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

// DELETE - Delete an event (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;

    const { error } = await supabaseServer
      .from("events")
      .delete()
      .eq("id", eventId);

    if (error) {
      console.error("Error deleting event:", error);
      return NextResponse.json(
        { error: "Failed to delete event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
