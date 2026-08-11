import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export type CompAccessLevel = "admin" | "staff";

export type CompStaffAuthResult =
  | { ok: true; userId: string; token: string; access: CompAccessLevel }
  | { ok: false; response: NextResponse };

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

export function isCompAdmin(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "admin";
}

export async function isCompEventStaff(
  userId: string,
  eventId: string
): Promise<boolean> {
  const { data } = await supabaseServer
    .from("comp_event_staff")
    .select("id")
    .eq("event_id", eventId)
    .eq("profile_id", userId)
    .maybeSingle();
  return !!data;
}

export async function resolveCompAccess(
  userId: string,
  role: string | null | undefined,
  eventId: string
): Promise<CompAccessLevel | null> {
  if (isCompAdmin(role)) return "admin";
  if (await isCompEventStaff(userId, eventId)) return "staff";
  return null;
}

export async function resolveEventIdForRound(
  roundId: string
): Promise<string | null> {
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("competition_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round?.competition_id) return null;

  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("event_id")
    .eq("id", round.competition_id)
    .maybeSingle();
  return competition?.event_id ?? null;
}

async function loadProfileRole(userId: string): Promise<string | null> {
  const { data } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role ?? null;
}

async function authenticateRequest(
  req: NextRequest
): Promise<
  | { ok: true; userId: string; token: string; role: string | null }
  | { ok: false; response: NextResponse }
> {
  const tokenOrResponse = extractBearerToken(req);
  if (tokenOrResponse instanceof NextResponse) {
    return { ok: false, response: tokenOrResponse };
  }

  const { user, error } = await getUserFromToken(tokenOrResponse);
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 }),
    };
  }

  const role = await loadProfileRole(user.id);
  if (role == null) {
    return {
      ok: false,
      response: NextResponse.json({ error: "User profile not found" }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id, token: tokenOrResponse, role };
}

/** Full comp admin (profiles.role === admin). */
export async function requireCompAdminAuth(
  req: NextRequest
): Promise<CompStaffAuthResult> {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth;

  if (!isCompAdmin(auth.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: auth.userId, token: auth.token, access: "admin" };
}

/** Admin or assigned event staff. */
export async function requireCompEventStaffAuth(
  req: NextRequest,
  eventId: string
): Promise<CompStaffAuthResult> {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth;

  const access = await resolveCompAccess(auth.userId, auth.role, eventId);
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: Event staff access required" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: auth.userId, token: auth.token, access };
}

/** Admin or event staff for the round's comp event. */
export async function requireCompCheckinAuth(
  req: NextRequest,
  roundId: string
): Promise<CompStaffAuthResult & { eventId?: string }> {
  const eventId = await resolveEventIdForRound(roundId);
  if (!eventId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Round not found" }, { status: 404 }),
    };
  }

  const auth = await requireCompEventStaffAuth(req, eventId);
  if (!auth.ok) return auth;
  return { ...auth, eventId };
}

type StaffEventRow = {
  id: string;
  title: string;
  starts_at: string;
  type?: string;
};

function joinedEvent(
  event: StaffEventRow | StaffEventRow[] | null | undefined
): StaffEventRow | null {
  if (event == null) return null;
  return Array.isArray(event) ? (event[0] ?? null) : event;
}

export async function loadCompStaffEventsForUser(userId: string) {
  const { data } = await supabaseServer
    .from("comp_event_staff")
    .select("event:events(id, title, starts_at, type)")
    .eq("profile_id", userId);
  const events: { id: string; title: string; starts_at: string }[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const event = joinedEvent(
      (row as { event?: StaffEventRow | StaffEventRow[] | null }).event
    );
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);
    events.push({
      id: event.id,
      title: event.title,
      starts_at: event.starts_at,
    });
  }
  events.sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
  );
  return events;
}
