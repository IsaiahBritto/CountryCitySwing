import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import {
  canMutateRegistrationEvent,
  canViewRegistrationEvent,
  resolveRegistrationAccess,
  showRegistrationForEvents,
  type RegistrationAccess,
  type RegistrationAccessLevel,
  type RegistrationEventRow,
} from "@/lib/registrationAuthPolicy";

export type {
  RegistrationAccess,
  RegistrationAccessLevel,
  RegistrationEventRow,
} from "@/lib/registrationAuthPolicy";

export {
  canMutateRegistrationEvent,
  canViewRegistrationEvent,
  isRegistrationOpenForEvent,
  resolveRegistrationAccess,
  showRegistrationForEvents,
} from "@/lib/registrationAuthPolicy";

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

export function assertRegistrationEventViewAccess(
  access: RegistrationAccessLevel,
  event: RegistrationEventRow
): NextResponse | null {
  if (canViewRegistrationEvent(access, event)) return null;
  if (access === "social_viewer") {
    return forbidden("Forbidden: Social event registration only");
  }
  return forbidden("Forbidden: Registration not available for this event at this time");
}

export function assertRegistrationEventMutateAccess(
  access: RegistrationAccessLevel,
  event: RegistrationEventRow,
  now: Date = new Date()
): NextResponse | null {
  if (canMutateRegistrationEvent(access, event, now)) return null;
  if (access === "social_viewer" && !isSocialEventType(event.type)) {
    return forbidden("Forbidden: Social event registration only");
  }
  return forbidden("Forbidden: Registration not available for this event at this time");
}

/** @deprecated Use assertRegistrationEventViewAccess or assertRegistrationEventMutateAccess */
export function assertRegistrationEventAccess(
  access: RegistrationAccessLevel,
  event: RegistrationEventRow,
  now: Date = new Date()
): NextResponse | null {
  return assertRegistrationEventMutateAccess(access, event, now);
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
