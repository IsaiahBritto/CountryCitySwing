import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import {
  isCommunityEvent,
  type EventApprovalStatus,
  type EventHostKind,
} from "@/lib/communityEvents";

export type CompEventAccessLevel =
  | "site_admin"
  | "organizer"
  | "staff";

export type EventHostMeta = {
  id: string;
  host_kind: EventHostKind;
  approval_status: EventApprovalStatus;
  organizer_profile_id: string | null;
};

export type CompEventAccessResult =
  | {
      ok: true;
      userId: string;
      token: string;
      access: CompEventAccessLevel;
      event: EventHostMeta;
    }
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

export function isSiteAdminRole(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "admin";
}

export async function loadEventHostMeta(
  eventId: string
): Promise<EventHostMeta | null> {
  const { data } = await supabaseServer
    .from("events")
    .select("id, host_kind, approval_status, organizer_profile_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!data?.id) return null;
  return {
    id: data.id as string,
    host_kind: (data.host_kind ?? "ccs") as EventHostKind,
    approval_status: (data.approval_status ?? "approved") as EventApprovalStatus,
    organizer_profile_id: (data.organizer_profile_id as string | null) ?? null,
  };
}

export async function loadEventIdForCompetition(
  competitionId: string
): Promise<string | null> {
  const { data } = await supabaseServer
    .from("competitions")
    .select("event_id")
    .eq("id", competitionId)
    .maybeSingle();
  return (data?.event_id as string | null) ?? null;
}

export async function isCompEventStaffMember(
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

export async function resolveCompEventAccess(
  userId: string,
  role: string | null | undefined,
  event: EventHostMeta
): Promise<CompEventAccessLevel | null> {
  if (isSiteAdminRole(role)) return "site_admin";
  if (event.organizer_profile_id === userId) return "organizer";
  if (await isCompEventStaffMember(userId, event.id)) return "staff";
  return null;
}

/** Community comp console / manage APIs require approved event (except site admin). */
export function communityManageAllowed(
  event: EventHostMeta,
  access: CompEventAccessLevel
): boolean {
  if (!isCommunityEvent(event)) return true;
  if (access === "site_admin") return true;
  if (access === "organizer") return event.approval_status === "approved";
  return event.approval_status === "approved";
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

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: "User profile not found" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: user.id,
    token: tokenOrResponse,
    role: profile.role ?? null,
  };
}

async function requireEventAccess(
  req: NextRequest,
  eventId: string,
  options: {
    allowStaff?: boolean;
    allowOrganizer?: boolean;
    requireManage?: boolean;
  }
): Promise<CompEventAccessResult> {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth;

  const event = await loadEventHostMeta(eventId);
  if (!event) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Event not found" }, { status: 404 }),
    };
  }

  const access = await resolveCompEventAccess(auth.userId, auth.role, event);
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: Event access required" },
        { status: 403 }
      ),
    };
  }

  if (options.requireManage) {
    if (access === "staff") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Forbidden: Organizer access required" },
          { status: 403 }
        ),
      };
    }
    if (!communityManageAllowed(event, access)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Forbidden: Event must be approved before managing competitions" },
          { status: 403 }
        ),
      };
    }
  } else if (options.allowStaff === false && access === "staff") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (options.allowOrganizer === false && access === "organizer") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: auth.userId,
    token: auth.token,
    access,
    event,
  };
}

/** Bibs, check-in, registrants, round check-in. */
export async function requireCompEventOpsAuth(
  req: NextRequest,
  eventId: string
): Promise<CompEventAccessResult> {
  const result = await requireEventAccess(req, eventId, {
    allowStaff: true,
    allowOrganizer: true,
  });
  if (!result.ok) return result;
  if (!communityManageAllowed(result.event, result.access)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: Event must be approved" },
        { status: 403 }
      ),
    };
  }
  return result;
}

/** Competition console, rounds, judges, entries, staff management. */
export async function requireCompEventManageAuth(
  req: NextRequest,
  eventId: string
): Promise<CompEventAccessResult> {
  return requireEventAccess(req, eventId, {
    requireManage: true,
    allowOrganizer: true,
  });
}

export async function requireCompetitionManageAuth(
  req: NextRequest,
  competitionId: string
): Promise<CompEventAccessResult & { eventId?: string }> {
  const eventId = await loadEventIdForCompetition(competitionId);
  if (!eventId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Competition not found" }, { status: 404 }),
    };
  }
  const auth = await requireCompEventManageAuth(req, eventId);
  if (!auth.ok) return auth;
  return { ...auth, eventId };
}

export async function requireRoundManageAuth(
  req: NextRequest,
  roundId: string
): Promise<CompEventAccessResult & { eventId?: string; competitionId?: string }> {
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("competition_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round?.competition_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Round not found" }, { status: 404 }),
    };
  }
  const auth = await requireCompetitionManageAuth(req, round.competition_id as string);
  if (!auth.ok) return auth;
  return {
    ...auth,
    competitionId: round.competition_id as string,
  };
}

export async function requireCompEventStaffManagementAuth(
  req: NextRequest,
  eventId: string
): Promise<CompEventAccessResult> {
  return requireCompEventManageAuth(req, eventId);
}

export async function isUserOrganizerForCompetition(
  userId: string,
  competitionId: string
): Promise<boolean> {
  const eventId = await loadEventIdForCompetition(competitionId);
  if (!eventId) return false;
  const event = await loadEventHostMeta(eventId);
  if (!event) return false;
  return event.organizer_profile_id === userId;
}

export async function loadOrganizedEventsForUser(userId: string) {
  const { data } = await supabaseServer
    .from("events")
    .select("id, title, starts_at, approval_status, host_kind")
    .eq("organizer_profile_id", userId)
    .eq("host_kind", "community")
    .order("starts_at", { ascending: false });
  return (data ?? []).map((e) => ({
    id: e.id as string,
    title: e.title as string,
    starts_at: e.starts_at as string,
    approval_status: (e.approval_status ?? "draft") as EventApprovalStatus,
  }));
}

export async function isCommunityCompEventId(
  eventId: string | null | undefined
): Promise<boolean> {
  if (!eventId?.trim()) return false;
  const meta = await loadEventHostMeta(eventId.trim());
  return !!meta && isCommunityEvent(meta);
}

/** Stripe comp checkout must not mutate community (offline) comp signups. */
export const COMMUNITY_COMP_PLAYLIST_FORBIDDEN_MESSAGE =
  "Competition Spotify playlist generation is not available for Non-CCS events.";

export async function rejectCommunityCompPlaylistApi(
  eventId: string
): Promise<NextResponse | null> {
  if (await isCommunityCompEventId(eventId)) {
    return NextResponse.json(
      { error: COMMUNITY_COMP_PLAYLIST_FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }
  return null;
}

export async function compSignupBelongsToCommunityEvent(
  compSignupId: string,
  metadataEventId?: string | null
): Promise<boolean> {
  let eventId = metadataEventId?.trim() || null;
  if (!eventId) {
    const { data } = await supabaseServer
      .from("comp_signups")
      .select("event_id")
      .eq("id", compSignupId)
      .maybeSingle();
    eventId = data?.event_id ?? null;
  }
  return isCommunityCompEventId(eventId);
}
