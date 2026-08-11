import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { findOrCreateBibRecord } from "@/lib/comps/bibs";

async function loadCompetition(competitionId: string) {
  const { data } = await supabaseServer
    .from("competitions")
    .select("id, event_id, comp_type")
    .eq("id", competitionId)
    .maybeSingle();
  return data;
}

/** Emails of assigned judges: competitors cannot also judge this comp. */
async function judgeEmails(competitionId: string): Promise<Set<string>> {
  const { data } = await supabaseServer
    .from("comp_judge_assignments")
    .select("profile:profiles(email)")
    .eq("competition_id", competitionId);
  const set = new Set<string>();
  for (const row of (data ?? []) as any[]) {
    const email = (row.profile?.email ?? "").trim().toLowerCase();
    if (email) set.add(email);
  }
  return set;
}

/** POST: add a walk-up entry (individual for JnJ, couple for Strictly). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  const competition = await loadCompetition(competitionId);
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }

  const body = await req.json();
  const entryKind = body.entry_kind;
  if (entryKind !== "individual" && entryKind !== "couple") {
    return NextResponse.json(
      { error: "entry_kind must be individual or couple" },
      { status: 400 }
    );
  }
  const role = body.role ?? null;
  if (entryKind === "individual" && role !== "lead" && role !== "follow") {
    return NextResponse.json(
      { error: "Individual entries require role lead or follow" },
      { status: 400 }
    );
  }

  const norm = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const leadFirst = norm(body.lead_first_name);
  const leadLast = norm(body.lead_last_name);
  const leadEmail = norm(body.lead_email).toLowerCase() || null;
  const followFirst = norm(body.follow_first_name);
  const followLast = norm(body.follow_last_name);
  const followEmail = norm(body.follow_email).toLowerCase() || null;

  const blockedEmails = await judgeEmails(competitionId);
  for (const email of [leadEmail, followEmail]) {
    if (email && blockedEmails.has(email)) {
      return NextResponse.json(
        { error: `${email} is a judge for this competition and cannot compete in it` },
        { status: 409 }
      );
    }
  }

  // Bibs: JnJ individuals wear a bib; Strictly couples only the lead does.
  let leadBibId: string | null = null;
  let followBibId: string | null = null;
  if (entryKind === "couple" || role === "lead") {
    if (leadFirst || leadLast || leadEmail) {
      leadBibId = await findOrCreateBibRecord(competition.event_id, {
        firstName: leadFirst,
        lastName: leadLast,
        email: leadEmail,
      });
    }
  }
  if (entryKind === "individual" && role === "follow") {
    followBibId = await findOrCreateBibRecord(competition.event_id, {
      firstName: followFirst,
      lastName: followLast,
      email: followEmail,
    });
  }

  const { data, error } = await supabaseServer
    .from("comp_entries")
    .insert([
      {
        competition_id: competitionId,
        entry_kind: entryKind,
        role: entryKind === "individual" ? role : null,
        lead_first_name: leadFirst,
        lead_last_name: leadLast,
        lead_email: leadEmail,
        follow_first_name: followFirst,
        follow_last_name: followLast,
        follow_email: followEmail,
        lead_bib_id: leadBibId,
        follow_bib_id: followBibId,
      },
    ])
    .select("*")
    .single();

  if (error) {
    console.error("[admin/comps/entries] insert failed", error);
    return NextResponse.json({ error: "Failed to add entry" }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

/** PATCH: edit entry names/emails (allowed while competition is running). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const body = await req.json();
  const entryId = body.entry_id;
  if (!entryId) {
    return NextResponse.json({ error: "entry_id is required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const field of [
    "lead_first_name",
    "lead_last_name",
    "lead_email",
    "follow_first_name",
    "follow_last_name",
    "follow_email",
  ]) {
    if (typeof body[field] === "string") update[field] = body[field].trim();
  }

  const { data, error } = await supabaseServer
    .from("comp_entries")
    .update(update)
    .eq("id", entryId)
    .eq("competition_id", competitionId)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

/** DELETE: remove an entry that has not danced yet. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const entryId = req.nextUrl.searchParams.get("entry_id");
  if (!entryId) {
    return NextResponse.json({ error: "entry_id is required" }, { status: 400 });
  }

  // Block deletion once the entry has scores in any round; scratch instead.
  const { data: scored } = await supabaseServer
    .from("comp_scores")
    .select("id, round_entry:comp_round_entries!inner(entry_id)")
    .eq("round_entry.entry_id", entryId)
    .limit(1);
  if ((scored ?? []).length > 0) {
    return NextResponse.json(
      { error: "This entry already has scores; scratch it from the round instead" },
      { status: 409 }
    );
  }

  const { error } = await supabaseServer
    .from("comp_entries")
    .delete()
    .eq("id", entryId)
    .eq("competition_id", competitionId);
  if (error) {
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
