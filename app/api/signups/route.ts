import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

// Helper to get user from access token (catches network/timeout so we don't throw)
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

  try {
    const { data: { user }, error } = await client.auth.getUser(accessToken);
    return { user, error };
  } catch (err: unknown) {
    // Network/timeout (e.g. ConnectTimeoutError) - don't throw; return so caller can return 503
    const message = err instanceof Error ? err.message : "Auth request failed";
    const cause = err instanceof Error && "cause" in err ? (err as { cause?: Error }).cause : undefined;
    const isTimeout =
      message.includes("fetch failed") ||
      message.includes("timeout") ||
      message.includes("Timeout") ||
      (cause instanceof Error && (cause.message?.includes("timeout") || (cause as { code?: string }).code === "UND_ERR_CONNECT_TIMEOUT"));
    return {
      user: null,
      error: { message: isTimeout ? "Auth service temporarily unavailable (timeout)" : message },
      isNetworkError: !!isTimeout,
    };
  }
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
    const { user, error: authError, isNetworkError } = await getUserFromToken(accessToken);

    if (authError || !user) {
      const status = isNetworkError ? 503 : 401;
      const message = isNetworkError
        ? "Auth service temporarily unavailable. Please check your connection and try again."
        : "Unauthorized: Invalid token";
      return NextResponse.json({ error: message }, { status });
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

    // Fetch all signups for this event so we can return total + checked_in counts
    const { data: allSignups, error } = await supabaseServer
      .from("signups")
      .select("*")
      .eq("event_id", eventId)
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Error fetching signups:", error);
      return NextResponse.json(
        { error: "Failed to fetch signups" },
        { status: 500 }
      );
    }

    const list = allSignups || [];
    const total = list.length;
    const checked_in = list.filter((s: { checked_in?: boolean }) => s.checked_in === true).length;

    // Apply filter to list
    let signups = list;
    if (filter === "not_checked_in") {
      signups = list.filter((s: { checked_in?: boolean }) => s.checked_in !== true);
    } else if (filter === "checked_in") {
      signups = list.filter((s: { checked_in?: boolean }) => s.checked_in === true);
    }

    return NextResponse.json({ signups, total, checked_in });
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
    const { user, error: authError, isNetworkError } = await getUserFromToken(accessToken);

    if (authError || !user) {
      const status = isNetworkError ? 503 : 401;
      const message = isNetworkError
        ? "Auth service temporarily unavailable. Please check your connection and try again."
        : "Unauthorized: Invalid token";
      return NextResponse.json({ error: message }, { status });
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
