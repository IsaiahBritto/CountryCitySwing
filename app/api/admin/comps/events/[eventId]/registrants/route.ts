import { NextRequest, NextResponse } from "next/server";
import { requireCompEventStaffAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  collectEventRegistrants,
  type EventRegistrantPerson,
} from "@/lib/comps/eventRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";
import { resolveRegistrant, strictlyPartnerName } from "@/lib/comps/registrantResolve";
import {
  applyRegistrantPatch,
  RegistrantSyncError,
  type RegistrantRolesPatch,
} from "@/lib/comps/registrantSync";
import { refreshTabulationDisplayNamesForCompetitions } from "@/lib/comps/refreshTabulationDisplayNames";

async function loadEventJudges(eventId: string) {
  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id")
    .eq("event_id", eventId);
  const compIds = (competitions ?? []).map((c) => c.id);
  if (compIds.length === 0) return [];

  const { data: judgeRows } = await supabaseServer
    .from("comp_judge_assignments")
    .select("profile_id, profile:profiles(email)")
    .in("competition_id", compIds);

  const refs: { profileId: string | null; email: string | null }[] = [];
  const seen = new Set<string>();
  for (const row of (judgeRows ?? []) as {
    profile_id?: string | null;
    profile?: { email?: string | null } | null;
  }[]) {
    const profileId = row.profile_id?.trim() || null;
    const email =
      typeof row.profile?.email === "string"
        ? row.profile.email.trim().toLowerCase()
        : null;
    const key = profileId ?? email ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    refs.push({ profileId, email });
  }
  return refs;
}

async function loadEventRoster(eventId: string): Promise<EventRegistrantPerson[]> {
  const [signupsRes, bibsRes, judges] = await Promise.all([
    supabaseServer.from("comp_signups").select("*").eq("event_id", eventId),
    supabaseServer
      .from("comp_bibs")
      .select("id, first_name, last_name, email, profile_id, bib_number")
      .eq("event_id", eventId),
    loadEventJudges(eventId),
  ]);

  if (signupsRes.error || bibsRes.error) {
    throw new Error("Failed to load roster");
  }

  return collectEventRegistrants(
    (signupsRes.data ?? []) as CompSignupRow[],
    bibsRes.data ?? [],
    { judges }
  );
}

function parseRoles(body: Record<string, unknown>): RegistrantRolesPatch | undefined {
  const roles = body.roles;
  if (!roles || typeof roles !== "object") return undefined;
  const r = roles as Record<string, unknown>;
  return {
    jnj_lead: r.jnj_lead === true,
    jnj_follow: r.jnj_follow === true,
    strictly_lead: r.strictly_lead === true,
    strictly_follow: r.strictly_follow === true,
  };
}

/** GET ?personKey=… — detail for edit dialog. PATCH — apply roster edit. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireCompEventStaffAuth(req, eventId);
  if (!auth.ok) return auth.response;

  const personKey = req.nextUrl.searchParams.get("personKey");
  if (!personKey) {
    return NextResponse.json(
      { error: "personKey query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const roster = await loadEventRoster(eventId);
    const rosterPerson = roster.find((r) => r.personKey === personKey);
    const resolved = await resolveRegistrant(
      eventId,
      personKey,
      rosterPerson
    );
    if (!resolved) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    return NextResponse.json({
      detail: {
        ...resolved,
        strictlyPartnerName: strictlyPartnerName(resolved, personKey),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to load detail" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireCompEventStaffAuth(req, eventId);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const personKey = typeof body.personKey === "string" ? body.personKey : "";
  if (!personKey) {
    return NextResponse.json({ error: "personKey is required" }, { status: 400 });
  }

  const identityRaw = body.identity;
  if (!identityRaw || typeof identityRaw !== "object") {
    return NextResponse.json({ error: "identity is required" }, { status: 400 });
  }
  const id = identityRaw as Record<string, unknown>;
  const firstName = typeof id.firstName === "string" ? id.firstName.trim() : "";
  const lastName = typeof id.lastName === "string" ? id.lastName.trim() : "";
  if (!firstName && !lastName) {
    return NextResponse.json(
      { error: "First or last name is required" },
      { status: 400 }
    );
  }

  try {
    const roster = await loadEventRoster(eventId);
    const rosterPerson = roster.find((r) => r.personKey === personKey);
    const resolved = await resolveRegistrant(
      eventId,
      personKey,
      rosterPerson
    );
    if (!resolved) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const email =
      typeof id.email === "string" ? id.email.trim() : id.email === null ? null : undefined;

    const result = await applyRegistrantPatch({
      eventId,
      resolved,
      identity: {
        firstName,
        lastName,
        email,
      },
      roles: parseRoles(body),
      strictlySwapLeadFollow: body.strictlySwapLeadFollow === true,
      tier: resolved.overallTier,
    });

    let tabulationRoundIds: string[] = [];
    if (body.refreshPublishedNames === true) {
      const refresh = await refreshTabulationDisplayNamesForCompetitions(
        result.competitionIds
      );
      tabulationRoundIds = refresh.roundIds;
    }

    const updatedRoster = await loadEventRoster(eventId);

    return NextResponse.json({
      roster: updatedRoster,
      warnings: result.warnings,
      tabulationRoundIds,
    });
  } catch (err) {
    if (err instanceof RegistrantSyncError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/registrants] PATCH failed", err);
    return NextResponse.json({ error: "Failed to save changes" }, { status: 500 });
  }
}
