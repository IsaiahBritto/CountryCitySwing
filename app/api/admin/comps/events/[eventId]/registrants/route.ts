import { NextRequest, NextResponse } from "next/server";
import { isCommunityEvent } from "@/lib/communityEvents";
import { loadEventHostMeta } from "@/lib/compEventAccess";
import { requireCompEventStaffAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import type { EventRegistrantPerson } from "@/lib/comps/eventRegistrants";
import { loadEventRosterWithLabels } from "@/lib/comps/eventRosterLoad";
import { resolveRegistrant, strictlyPartnerName } from "@/lib/comps/registrantResolve";
import {
  applyRegistrantPatch,
  RegistrantSyncError,
  type RegistrantRolesPatch,
  type RegistrantDivisionSelections,
} from "@/lib/comps/registrantSync";
import { refreshTabulationDisplayNamesForCompetitions } from "@/lib/comps/refreshTabulationDisplayNames";

function parseDivisionSelections(
  body: Record<string, unknown>
): RegistrantDivisionSelections | undefined {
  const raw = body.divisionSelections;
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const pick = (k: string) =>
    d[k] === null ? null : typeof d[k] === "string" ? d[k] : undefined;
  return {
    jnjCompetitionId: pick("jnjCompetitionId"),
    strictlyCompetitionId: pick("strictlyCompetitionId"),
    allAmericanCompetitionId: pick("allAmericanCompetitionId"),
  };
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
    const roster = await loadEventRosterWithLabels(eventId);
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

  const eventMeta = await loadEventHostMeta(eventId);
  const compSignupId =
    typeof body.compSignupId === "string" ? body.compSignupId.trim() : "";
  if (body.markPaid === true && compSignupId && eventMeta && isCommunityEvent(eventMeta)) {
    const { error: payErr } = await supabaseServer
      .from("comp_signups")
      .update({
        paid: true,
        payment_confirmed_at: new Date().toISOString(),
        payment_confirmed_by: auth.userId,
      })
      .eq("id", compSignupId)
      .eq("event_id", eventId);
    if (payErr) {
      return NextResponse.json({ error: "Failed to mark paid" }, { status: 500 });
    }
    const updatedRoster = await loadEventRosterWithLabels(eventId);
    return NextResponse.json({ roster: updatedRoster, warnings: [] });
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
    const roster = await loadEventRosterWithLabels(eventId);
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
      divisionSelections: parseDivisionSelections(body),
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

    const updatedRoster = await loadEventRosterWithLabels(eventId);

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
