import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { isSocialRegistrationViewer } from "@/lib/socialRegistrationAccess";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import {
  DEFAULT_TIME_ZONE,
  isRegistrationWindowOpen,
} from "@/lib/utils/dateHelpers";

export type RegistrationAccessLevel = "admin" | "instructor" | "social_viewer";

export type RegistrationAccess = {
  userId: string;
  level: RegistrationAccessLevel;
};

export type RegistrationEventRow = {
  type?: string | null;
  starts_at: string;
  ends_at?: string | null;
  time_zone?: string | null;
};

export type RegistrationAccessResult =
  | { ok: true; access: RegistrationAccess; token: string }
  | { ok: false; response: NextResponse };

function unauthorized(message = "Unauthorized: Invalid token"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

async function getUserFromToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(accessToken);
  return { user, error };
}

export function resolveRegistrationAccess(
  userId: string,
  role: string | null | undefined
): RegistrationAccessLevel | null {
  const roleLower = (role || "").toLowerCase();
  if (roleLower === "admin") return "admin";
  if (roleLower === "instructor") return "instructor";
  if (isSocialRegistrationViewer(userId)) return "social_viewer";
  return null;
}

export function isRegistrationOpenForEvent(
  access: RegistrationAccessLevel,
  event: RegistrationEventRow,
  now: Date = new Date()
): boolean {
  if (access === "admin") return true;
  const tz = event.time_zone || DEFAULT_TIME_ZONE;
  if (
    !isRegistrationWindowOpen(event.starts_at, event.ends_at, tz, now)
  ) {
    return false;
  }
  if (access === "social_viewer") {
    return isSocialEventType(event.type);
  }
  return true;
}

export function showRegistrationForEvents(
  access: RegistrationAccessLevel | null,
  events: RegistrationEventRow[],
  now: Date = new Date()
): boolean {
  if (!access) return false;
  if (access === "admin") return true;
  return events.some((event) => isRegistrationOpenForEvent(access, event, now));
}

export function assertRegistrationEventAccess(
  access: RegistrationAccessLevel,
  event: RegistrationEventRow,
  now: Date = new Date()
): NextResponse | null {
  if (access === "admin") return null;

  const tz = event.time_zone || DEFAULT_TIME_ZONE;
  if (!isRegistrationWindowOpen(event.starts_at, event.ends_at, tz, now)) {
    return forbidden("Forbidden: Registration not available for this event at this time");
  }

  if (access === "social_viewer" && !isSocialEventType(event.type)) {
    return forbidden("Forbidden: Social event registration only");
  }

  return null;
}

export async function getRegistrationAccess(
  accessToken: string
): Promise<{ access: RegistrationAccess | null; error?: NextResponse }> {
  const { user, error } = await getUserFromToken(accessToken);
  if (error || !user) {
    return { access: null, error: unauthorized() };
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { access: null, error: forbidden("User profile not found") };
  }

  const level = resolveRegistrationAccess(user.id, profile.role);
  if (!level) {
    return {
      access: null,
      error: forbidden("Forbidden: Registration access required"),
    };
  }

  return { access: { userId: user.id, level } };
}

export function extractBearerToken(req: NextRequest): string | NextResponse {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid authorization header" },
      { status: 401 }
    );
  }
  return authHeader.replace("Bearer ", "");
}

export async function requireRegistrationAuth(
  req: NextRequest
): Promise<RegistrationAccessResult> {
  const tokenOrResponse = extractBearerToken(req);
  if (tokenOrResponse instanceof NextResponse) {
    return { ok: false, response: tokenOrResponse };
  }

  const { access, error } = await getRegistrationAccess(tokenOrResponse);
  if (error || !access) {
    return {
      ok: false,
      response: error ?? forbidden("Forbidden: Registration access required"),
    };
  }

  return { ok: true, access, token: tokenOrResponse };
}

export async function loadRegistrationEvent(
  eventId: string
): Promise<{ event: RegistrationEventRow | null; error?: NextResponse }> {
  const { data: eventRow, error } = await supabaseServer
    .from("events")
    .select("type, starts_at, ends_at, time_zone")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !eventRow?.starts_at) {
    return {
      event: null,
      error: NextResponse.json({ error: "Event not found" }, { status: 404 }),
    };
  }

  return {
    event: {
      type: eventRow.type,
      starts_at: String(eventRow.starts_at),
      ends_at: eventRow.ends_at != null ? String(eventRow.ends_at) : null,
      time_zone: eventRow.time_zone,
    },
  };
}
