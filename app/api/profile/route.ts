import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

async function getUserFromToken(accessToken: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
  const { data, error } = await client.auth.getUser(accessToken);
  const user = data?.user ?? null;
  return { user, error };
}

/** Normalize optional string fields: empty string -> null so DB state is consistent */
function emptyToNull(v: string | null | undefined): string | null {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  return typeof v === "string" ? v.trim() : null;
}

/**
 * GET - Fetch the current user's profile.
 * Uses service role so all columns are returned regardless of RLS.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
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

    const { data, error } = await supabaseServer
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Profile GET Supabase error:", error.message);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ...data, email: user.email ?? null });
  } catch (err) {
    console.error("Profile GET error:", err);
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update the current user's profile.
 * Uses service role so all fields are written regardless of RLS.
 * Only the authenticated user can update their own profile (id from token).
 */
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
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

    const body = await req.json();

    // Build update payload: only allow known profile columns; use authenticated user id
    const updateData: Record<string, unknown> = {
      first_name:
        typeof body.first_name === "string" ? body.first_name.trim() : body.first_name ?? null,
      last_name:
        typeof body.last_name === "string" ? body.last_name.trim() : body.last_name ?? null,
    };

    // Optional photo (client uploads to storage and sends URL)
    if (body.photo_url !== undefined) {
      updateData.photo_url = emptyToNull(body.photo_url);
    }

    // Instructor/admin-only fields
    if (body.role === "instructor" || body.role === "admin") {
      updateData.instagram_url = emptyToNull(body.instagram_url);
      updateData.teaching_since = emptyToNull(body.teaching_since);
      updateData.favorite_song = emptyToNull(body.favorite_song);
      updateData.teaching_style = emptyToNull(body.teaching_style);
      updateData.bio_long = emptyToNull(body.bio_long);
      updateData.specialty = emptyToNull(body.specialty);
      updateData.phone_number = emptyToNull(body.phone_number);
      updateData.private_lessons = emptyToNull(body.private_lessons);
      updateData.private_lessons_link = emptyToNull(body.private_lessons_link);
      updateData.scheduling_enabled =
        body.scheduling_enabled === true || body.scheduling_enabled === false
          ? body.scheduling_enabled
          : null;
      updateData.lesson_duration_minutes =
        typeof body.lesson_duration_minutes === "number"
          ? body.lesson_duration_minutes
          : body.lesson_duration_minutes != null
            ? Number(body.lesson_duration_minutes)
            : null;
      updateData.prayer = emptyToNull(body.prayer);
    }

    const { error } = await supabaseServer
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (error) {
      console.error("Profile update error:", error.message);
      return NextResponse.json(
        { error: "Failed to update profile: " + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Profile API error:", err);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
