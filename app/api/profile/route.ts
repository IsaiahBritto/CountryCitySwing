import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { geocodeUsZip } from "@/lib/geocode";
import { US_STATE_CENTERS } from "@/lib/utils/usStates";

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

function isInstructorLikeRole(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "instructor" || r === "non-ccs-instructor" || r.includes("instructor");
}

const ALLOWED_SELF_ROLES = ["attendee", "non-ccs-instructor"];
const ALLOWED_ADMIN_SET_ROLES = ["attendee", "non-ccs-instructor"];

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
      .select("id,first_name,last_name,role,photo_url,instagram_url,teaching_since,favorite_song,teaching_style,bio_long,specialty,phone_number,private_lessons,private_lessons_link,scheduling_enabled,prayer,state,zip_code,latitude,longitude,newsletter_opt_in")
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
 * PATCH - Update the current user's profile, or (admin only) another user's profile/role.
 * Uses service role so all fields are written regardless of RLS.
 * Non-admins can only update own profile and only set role to attendee or non-ccs-instructor.
 * Admins can update any profile and set/remove non-ccs-instructor via body.profile_id + body.role.
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

    // Resolve whose profile we're updating and get current profile for permission/effectiveRole
    const myProfileRes = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const myProfile = myProfileRes.data;
    const isAdmin = (myProfile?.role ?? "").toLowerCase() === "admin";

    const targetId =
      body.profile_id != null && isAdmin ? String(body.profile_id).trim() : user.id;
    if (body.profile_id != null && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Only admins can update another user's profile" },
        { status: 403 }
      );
    }

    let targetProfile: { role: string | null } | null = myProfile ?? null;
    if (targetId !== user.id) {
      const { data: target } = await supabaseServer
        .from("profiles")
        .select("role")
        .eq("id", targetId)
        .single();
      targetProfile = target ?? null;
    }

    const effectiveRole = body.role !== undefined ? body.role : targetProfile?.role ?? null;
    const allowInstructorFields = isInstructorLikeRole(effectiveRole);

    const updateData: Record<string, unknown> = {};

    // Name, photo, newsletter: allow for self; allow for admin updating any
    if (targetId === user.id || isAdmin) {
      if (body.first_name !== undefined) {
        updateData.first_name =
          typeof body.first_name === "string" ? body.first_name.trim() : body.first_name ?? null;
      }
      if (body.last_name !== undefined) {
        updateData.last_name =
          typeof body.last_name === "string" ? body.last_name.trim() : body.last_name ?? null;
      }
      if (body.photo_url !== undefined) {
        updateData.photo_url = emptyToNull(body.photo_url);
      }
      if (body.newsletter_opt_in !== undefined) {
        updateData.newsletter_opt_in = body.newsletter_opt_in === true;
      }
    }

    // Role: self can only set attendee | non-ccs-instructor; admin can set/remove non-ccs-instructor for any.
    // If client sends current role unchanged (e.g. instructor updating zip), allow it without changing role.
    if (body.role !== undefined) {
      const newRole =
        typeof body.role === "string" ? body.role.trim().toLowerCase() : "";
      const currentRole = (targetProfile?.role ?? "").trim().toLowerCase();
      const isRoleChange = newRole !== currentRole;

      if (targetId === user.id && !isAdmin) {
        if (isRoleChange && !ALLOWED_SELF_ROLES.includes(newRole)) {
          return NextResponse.json(
            { error: "Forbidden: You can only set your role to Attendee or Non-CCS Instructor" },
            { status: 403 }
          );
        }
        if (isRoleChange) {
          updateData.role = newRole || null;
        }
      } else if (isAdmin) {
        updateData.role = newRole || null;
      }
    }

    // Instructor-type fields (including location): when effective role is instructor-like
    if (allowInstructorFields) {
      if (body.instagram_url !== undefined) updateData.instagram_url = emptyToNull(body.instagram_url);
      if (body.teaching_since !== undefined) updateData.teaching_since = emptyToNull(body.teaching_since);
      if (body.favorite_song !== undefined) updateData.favorite_song = emptyToNull(body.favorite_song);
      if (body.teaching_style !== undefined) updateData.teaching_style = emptyToNull(body.teaching_style);
      if (body.bio_long !== undefined) updateData.bio_long = emptyToNull(body.bio_long);
      if (body.specialty !== undefined) updateData.specialty = emptyToNull(body.specialty);
      if (body.phone_number !== undefined) updateData.phone_number = emptyToNull(body.phone_number);
      if (body.private_lessons !== undefined) updateData.private_lessons = emptyToNull(body.private_lessons);
      if (body.private_lessons_link !== undefined) updateData.private_lessons_link = emptyToNull(body.private_lessons_link);
      if (body.prayer !== undefined) updateData.prayer = emptyToNull(body.prayer);
      if (body.state !== undefined) updateData.state = emptyToNull(body.state);
      if (body.zip_code !== undefined) updateData.zip_code = emptyToNull(body.zip_code);
      if (body.latitude !== undefined) updateData.latitude = typeof body.latitude === "number" ? body.latitude : null;
      if (body.longitude !== undefined) updateData.longitude = typeof body.longitude === "number" ? body.longitude : null;
      // Scheduling only for core instructor/admin, not non-ccs-instructor
      if ((effectiveRole === "instructor" || effectiveRole === "admin") && body.scheduling_enabled !== undefined) {
        updateData.scheduling_enabled =
          body.scheduling_enabled === true || body.scheduling_enabled === false
            ? body.scheduling_enabled
            : null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true });
    }

    const { error } = await supabaseServer
      .from("profiles")
      .update(updateData)
      .eq("id", targetId);

    if (error) {
      console.error("Profile update error:", error.message);
      return NextResponse.json(
        { error: "Failed to update profile: " + error.message },
        { status: 500 }
      );
    }

    // Geocode when state/zip in request and we didn't send lat/lng. Also backfill if DB row still has no coords.
    const stateOrZip =
      (updateData.state !== undefined && updateData.state != null) ||
      (updateData.zip_code !== undefined && updateData.zip_code != null);
    const hadLatLngInBody =
      updateData.latitude !== undefined || updateData.longitude !== undefined;
    if (allowInstructorFields && stateOrZip && !hadLatLngInBody) {
      const zip = (updateData.zip_code ?? body.zip_code) as string | null | undefined;
      const state = (updateData.state ?? body.state) as string | null | undefined;
      const stateStr = emptyToNull(state);
      const z = emptyToNull(zip);
      let lat: number | null = null;
      let lon: number | null = null;
      if (z) {
        const geo = await geocodeUsZip(z, stateStr ?? undefined);
        if (geo) {
          lat = geo.latitude;
          lon = geo.longitude;
        }
      }
      // Fallback: if we have state but no lat/lng (no zip or geocoding failed), use state center so pin shows on map
      if ((lat == null || lon == null) && stateStr && US_STATE_CENTERS[stateStr]) {
        const [lonC, latC] = US_STATE_CENTERS[stateStr];
        lat = latC;
        lon = lonC;
      }
      if (lat != null && lon != null) {
        const { error: updateCoordError } = await supabaseServer
          .from("profiles")
          .update({ latitude: lat, longitude: lon })
          .eq("id", targetId);
        if (updateCoordError) {
          console.error("Profile lat/lng update failed:", updateCoordError.message, "profileId:", targetId);
        }
      }
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
