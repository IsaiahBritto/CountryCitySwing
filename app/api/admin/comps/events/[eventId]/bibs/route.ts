import { NextRequest, NextResponse } from "next/server";
import { requireCompEventStaffAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  assignBibNumbers,
  findOrCreateBibRecord,
  type BibAssignment,
} from "@/lib/comps/bibs";
import { collectEventRegistrants, type EventJudgeRef } from "@/lib/comps/eventRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";

async function loadEvent(eventId: string) {
  const { data } = await supabaseServer
    .from("events")
    .select("id, title, starts_at, ends_at, time_zone, type")
    .eq("id", eventId)
    .maybeSingle();
  return data;
}

async function loadEventJudges(eventId: string): Promise<EventJudgeRef[]> {
  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id")
    .eq("event_id", eventId);
  const compIds = (competitions ?? []).map((c) => c.id);
  if (compIds.length === 0) return [];

  const { data: judgeRows, error } = await supabaseServer
    .from("comp_judge_assignments")
    .select("profile_id, profile:profiles(email)")
    .in("competition_id", compIds);
  if (error) throw new Error("Failed to load judges");

  const refs: EventJudgeRef[] = [];
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

async function loadRoster(eventId: string) {
  const [signupsRes, bibsRes, judges] = await Promise.all([
    supabaseServer.from("comp_signups").select("*").eq("event_id", eventId),
    supabaseServer
      .from("comp_bibs")
      .select("id, first_name, last_name, email, profile_id, bib_number")
      .eq("event_id", eventId),
    loadEventJudges(eventId),
  ]);

  if (signupsRes.error) {
    throw new Error("Failed to load signups");
  }
  if (bibsRes.error) {
    throw new Error("Failed to load bibs");
  }

  return collectEventRegistrants(
    (signupsRes.data ?? []) as CompSignupRow[],
    bibsRes.data ?? [],
    { judges }
  );
}

/** GET: event registrants with current bib assignments. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireCompEventStaffAuth(req, eventId);
  if (!auth.ok) return auth.response;

  const event = await loadEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    const roster = await loadRoster(eventId);
    return NextResponse.json({ event, roster });
  } catch {
    return NextResponse.json({ error: "Failed to load roster" }, { status: 500 });
  }
}

interface PatchAssignment {
  bibId?: string;
  personKey?: string;
  bibNumber: number | null;
}

/** PATCH: bulk save bib numbers for event registrants. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireCompEventStaffAuth(req, eventId);
  if (!auth.ok) return auth.response;

  const event = await loadEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await req.json();
  const raw: PatchAssignment[] = Array.isArray(body.assignments)
    ? body.assignments
    : [];
  if (raw.length === 0) {
    return NextResponse.json(
      { error: "assignments is required" },
      { status: 400 }
    );
  }

  let roster;
  try {
    roster = await loadRoster(eventId);
  } catch {
    return NextResponse.json({ error: "Failed to load roster" }, { status: 500 });
  }

  const rosterByKey = new Map(roster.map((r) => [r.personKey, r]));

  const resolved: BibAssignment[] = [];

  for (const row of raw) {
    if (row.bibNumber == null) continue;
    if (!Number.isInteger(row.bibNumber) || row.bibNumber <= 0) {
      return NextResponse.json(
        { error: "Bib numbers must be positive integers" },
        { status: 400 }
      );
    }

    let bibId = row.bibId ?? null;
    if (!bibId && row.personKey) {
      const person = rosterByKey.get(row.personKey);
      if (!person) {
        return NextResponse.json(
          { error: `Unknown registrant ${row.personKey}` },
          { status: 400 }
        );
      }
      if (person.bibId) {
        bibId = person.bibId;
      } else {
        bibId = await findOrCreateBibRecord(eventId, {
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          profileId: person.profileId,
        });
        if (!bibId) {
          return NextResponse.json(
            { error: "Could not create bib record for registrant" },
            { status: 500 }
          );
        }
      }
    }

    if (!bibId) {
      return NextResponse.json(
        { error: "Each assignment needs bibId or personKey" },
        { status: 400 }
      );
    }

    resolved.push({ bibId, bibNumber: row.bibNumber });
  }

  if (resolved.length === 0) {
    return NextResponse.json(
      { error: "No bib numbers to save" },
      { status: 400 }
    );
  }

  const result = await assignBibNumbers(eventId, resolved);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const updatedRoster = await loadRoster(eventId);
  return NextResponse.json({ roster: updatedRoster });
}
