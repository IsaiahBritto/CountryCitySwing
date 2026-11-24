import { NextRequest, NextResponse } from "next/server";
import { requireCompEventStaffAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  assignBibNumbers,
  findOrCreateBibRecord,
  type BibAssignment,
} from "@/lib/comps/bibs";
import { loadEventRosterWithLabels } from "@/lib/comps/eventRosterLoad";

async function loadEvent(eventId: string) {
  const { data } = await supabaseServer
    .from("events")
    .select("id, title, starts_at, ends_at, time_zone, type, host_kind")
    .eq("id", eventId)
    .maybeSingle();
  return data;
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
    const roster = await loadEventRosterWithLabels(eventId);
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
    roster = await loadEventRosterWithLabels(eventId);
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

  const updatedRoster = await loadEventRosterWithLabels(eventId);
  return NextResponse.json({ roster: updatedRoster });
}
