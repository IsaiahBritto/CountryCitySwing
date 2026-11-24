import { NextRequest, NextResponse } from "next/server";
import { requireCompEventManageAuth } from "@/lib/compEventAccess";
import { isApprovedCommunityEvent } from "@/lib/communityEvents";
import { supabaseServer } from "@/lib/supabaseServer";
import { usesJnSignupColumns } from "@/lib/comps/competitionKind";

type RouteParams = { params: Promise<{ id: string }> };

/** GET: organizer/admin operate hub data for an approved community event. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: eventId } = await params;
  const auth = await requireCompEventManageAuth(req, eventId);
  if (!auth.ok) return auth.response;

  const { data: event, error: eventErr } = await supabaseServer
    .from("events")
    .select(
      "id, title, starts_at, ends_at, location, time_zone, host_kind, approval_status"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventErr || !event || !isApprovedCommunityEvent(event)) {
    return NextResponse.json({ error: "Event not available" }, { status: 404 });
  }

  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id, name, comp_type, status")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  const compList = competitions ?? [];
  const compIds = compList.map((c) => c.id as string);

  const entryCountByComp = new Map<string, number>();
  if (compIds.length > 0) {
    const { data: entries } = await supabaseServer
      .from("comp_entries")
      .select("competition_id")
      .in("competition_id", compIds);
    for (const row of entries ?? []) {
      const cid = row.competition_id as string;
      entryCountByComp.set(cid, (entryCountByComp.get(cid) ?? 0) + 1);
    }
  }

  const { data: signups } = await supabaseServer
    .from("comp_signups")
    .select("id, strictly_selected, jnj_selected, refunded_or_cancelled")
    .eq("event_id", eventId)
    .neq("refunded_or_cancelled", "cancelled");

  const activeSignups = signups ?? [];

  const importedByComp = new Map<string, Set<string>>();
  if (compIds.length > 0) {
    const { data: entrySignups } = await supabaseServer
      .from("comp_entries")
      .select("competition_id, comp_signup_id")
      .in("competition_id", compIds);
    for (const row of entrySignups ?? []) {
      const cid = row.competition_id as string;
      const sid = row.comp_signup_id as string | null;
      if (!sid) continue;
      const set = importedByComp.get(cid) ?? new Set<string>();
      set.add(sid);
      importedByComp.set(cid, set);
    }
  }

  const competitionsOut = compList.map((c) => {
    const cid = c.id as string;
    const useJnSignupSlots = usesJnSignupColumns(c.comp_type);
    const imported = importedByComp.get(cid) ?? new Set<string>();
    let importableCount = 0;
    for (const s of activeSignups) {
      const selected = useJnSignupSlots ? s.jnj_selected : s.strictly_selected;
      if (!selected) continue;
      if (imported.has(s.id as string)) continue;
      importableCount += 1;
    }
    return {
      id: cid,
      name: c.name,
      comp_type: c.comp_type,
      status: c.status,
      entryCount: entryCountByComp.get(cid) ?? 0,
      importableCount,
    };
  });

  return NextResponse.json({
    event,
    competitions: competitionsOut,
  });
}
