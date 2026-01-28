import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

// Helper to get user from access token
async function getUserFromToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
  
  const { data: { user }, error } = await client.auth.getUser(accessToken);
  return { user, error };
}

// GET - Fetch signups for an event (admin and instructor only)
export async function GET(req: NextRequest) {
  try {
    // Get access token from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { user, error: authError } = await getUserFromToken(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 }
      );
    }

    // Check user role using service role client (bypasses RLS)
    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 403 }
      );
    }

    // Use case-insensitive role check
    const roleLower = (profile.role || "").toLowerCase();
    const isAdmin = roleLower === "admin";
    const isInstructor = roleLower === "instructor" || roleLower.includes("instructor");

    if (!isAdmin && !isInstructor) {
      return NextResponse.json(
        { error: "Forbidden: Admin or instructor access required" },
        { status: 403 }
      );
    }

    // Get event_id from query params
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    const filter = searchParams.get("filter") || "all"; // all, not_checked_in, checked_in

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id parameter" },
        { status: 400 }
      );
    }

    // Build query
    // Note: event_id is a UUID, not an integer, so don't parse it
    let query = supabaseServer
      .from("signups")
      .select("*")
      .eq("event_id", eventId)
      .order("first_name", { ascending: true });

    // Apply filter
    if (filter === "not_checked_in") {
      query = query.eq("checked_in", false);
    } else if (filter === "checked_in") {
      query = query.eq("checked_in", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching signups:", error);
      return NextResponse.json(
        { error: "Failed to fetch signups" },
        { status: 500 }
      );
    }

    return NextResponse.json({ signups: data || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update signup status (admin and instructor only)
export async function PATCH(req: NextRequest) {
  try {
    // Get access token from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { user, error: authError } = await getUserFromToken(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 }
      );
    }

    // Check user role
    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 403 }
      );
    }

    // Use case-insensitive role check
    const roleLower = (profile.role || "").toLowerCase();
    const isAdmin = roleLower === "admin";
    const isInstructor = roleLower === "instructor" || roleLower.includes("instructor");

    if (!isAdmin && !isInstructor) {
      return NextResponse.json(
        { error: "Forbidden: Admin or instructor access required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { signupId, field, value } = body;

    if (!signupId || !field || value === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: signupId, field, value" },
        { status: 400 }
      );
    }

    if (!["paid", "checked_in"].includes(field)) {
      return NextResponse.json(
        { error: "Invalid field. Must be 'paid' or 'checked_in'" },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: any = { [field]: value };
    
    // If checking in, also mark as paid
    if (field === "checked_in" && value === true) {
      updateData.paid = true;
    }

    const { data, error } = await supabaseServer
      .from("signups")
      .update(updateData)
      .eq("id", signupId)
      .select()
      .single();

    if (error) {
      console.error("Error updating signup:", error);
      return NextResponse.json(
        { error: "Failed to update signup" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, signup: data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
