import { NextResponse } from "next/server";
import { loadOrganizedEventsForUser } from "@/lib/compEventAccess";
import { requireAuthenticatedProfile } from "@/lib/nonCcsEventAuth";
import { supabaseServer } from "@/lib/supabaseServer";

/** GET: organizer's community events (all statuses). */
export async function GET(req: Request) {
  const auth = await requireAuthenticatedProfile(req as import("next/server").NextRequest);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseServer
    .from("events")
    .select(
      "id,title,starts_at,ends_at,location,approval_status,submitted_at,approval_rejection_reason,community_payment_methods"
    )
    .eq("host_kind", "community")
    .eq("organizer_profile_id", auth.userId)
    .order("starts_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }

  const events = data ?? [];
  if (events.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const ids = events.map((e) => e.id);
  const { data: comps } = await supabaseServer
    .from("competitions")
    .select("id, event_id, name, comp_type")
    .in("event_id", ids);

  const byEvent = new Map<string, typeof comps>();
  for (const c of comps ?? []) {
    const list = byEvent.get(c.event_id as string) ?? [];
    list.push(c);
    byEvent.set(c.event_id as string, list);
  }

  return NextResponse.json({
    events: events.map((e) => ({
      ...e,
      competitions: byEvent.get(e.id as string) ?? [],
    })),
  });
}
