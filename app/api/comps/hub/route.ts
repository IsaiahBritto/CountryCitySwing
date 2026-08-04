import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { extractPodium } from "@/lib/comps/podium";
import { includeTestFixtures } from "@/lib/comps/testCompAccess";

/**
 * GET: public comps hub payload — upcoming events, live competitions, and
 * past comps with optional podiums (finals published only).
 * Admins may pass ?include_test=1 to include test_event / test_comp fixtures.
 */
export async function GET(req: NextRequest) {
  const includeTest = await includeTestFixtures(req);
  const nowIso = new Date().toISOString();

  let upcomingQuery = supabaseServer
    .from("events")
    .select(
      "id, title, starts_at, location, strictly_price, jnj_price, strictly_level, jnj_level, signup_link, refund_statement, test_event"
    )
    .eq("type", "Comp")
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true });
  if (!includeTest) {
    upcomingQuery = upcomingQuery.eq("test_event", false);
  }

  let liveQuery = supabaseServer
    .from("competitions")
    .select(
      "id, name, comp_type, status, test_comp, event:events(id, title, starts_at, location, test_event), rounds:comp_rounds(id, round_type, judged_role, status, scoring_mode, round_order, published_at)"
    )
    .eq("status", "in_progress");
  if (!includeTest) {
    liveQuery = liveQuery.eq("test_comp", false);
  }

  let publishedQuery = supabaseServer
    .from("comp_rounds")
    .select(
      "id, competition_id, round_type, judged_role, status, scoring_mode, tabulation, published_at, competition:competitions(id, name, comp_type, test_comp, event:events(id, title, starts_at, location, test_event))"
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (!includeTest) {
    publishedQuery = publishedQuery.eq("competition.test_comp", false);
  }

  const [upcomingRes, liveRes, publishedRoundsRes] = await Promise.all([
    upcomingQuery,
    liveQuery,
    publishedQuery,
  ]);

  if (upcomingRes.error) {
    console.error("[comps/hub] upcoming failed", upcomingRes.error);
    return NextResponse.json({ error: "Failed to load hub" }, { status: 500 });
  }
  if (liveRes.error) {
    console.error("[comps/hub] live failed", liveRes.error);
    return NextResponse.json({ error: "Failed to load hub" }, { status: 500 });
  }
  if (publishedRoundsRes.error) {
    console.error("[comps/hub] past failed", publishedRoundsRes.error);
    return NextResponse.json({ error: "Failed to load hub" }, { status: 500 });
  }

  const upcoming = (upcomingRes.data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    starts_at: e.starts_at,
    location: e.location,
    strictly_price: e.strictly_price,
    jnj_price: e.jnj_price,
    strictly_level: e.strictly_level,
    jnj_level: e.jnj_level,
    signup_link: e.signup_link,
    refund_statement: e.refund_statement,
    test_event: e.test_event ?? false,
  }));

  const live = ((liveRes.data ?? []) as any[])
    .filter((c) => includeTest || !c.test_comp)
    .map((c) => {
    const published = ((c.rounds ?? []) as any[]).filter(
      (r) => r.status === "published"
    );
    published.sort((a, b) => {
      const aPub = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bPub = b.published_at ? new Date(b.published_at).getTime() : 0;
      if (bPub !== aPub) return bPub - aPub;
      return (b.round_order ?? 0) - (a.round_order ?? 0);
    });
    const latest = published[0] ?? null;
    return {
      id: c.id,
      name: c.name,
      comp_type: c.comp_type,
      status: c.status,
      test_comp: c.test_comp ?? false,
      event: c.event,
      latestPublishedRound: latest
        ? {
            round_type: latest.round_type,
            judged_role: latest.judged_role,
            published_at: latest.published_at ?? null,
          }
        : null,
    };
  });

  // Group published rounds by event → competition
  type PastComp = {
    id: string;
    name: string;
    comp_type: string;
    test_comp: boolean;
    publishedRounds: number;
    podium: ReturnType<typeof extractPodium>;
    latestPublishedAt: string | null;
  };
  type PastEvent = {
    id: string;
    title: string;
    starts_at: string | null;
    location: string | null;
    test_event: boolean;
    competitions: PastComp[];
  };

  const eventsById = new Map<string, PastEvent>();
  const compsById = new Map<string, PastComp>();

  for (const round of (publishedRoundsRes.data ?? []) as any[]) {
    const comp = round.competition;
    if (!comp?.id || !comp.event?.id) continue;
    if (!includeTest && comp.test_comp) continue;
    const event = comp.event as {
      id: string;
      title: string;
      starts_at: string | null;
      location: string | null;
      test_event?: boolean;
    };

    if (!eventsById.has(event.id)) {
      eventsById.set(event.id, {
        id: event.id,
        title: event.title,
        starts_at: event.starts_at,
        location: event.location,
        test_event: event.test_event ?? false,
        competitions: [],
      });
    }

    let pastComp = compsById.get(comp.id);
    if (!pastComp) {
      pastComp = {
        id: comp.id,
        name: comp.name,
        comp_type: comp.comp_type,
        test_comp: comp.test_comp ?? false,
        publishedRounds: 0,
        podium: null,
        latestPublishedAt: null,
      };
      compsById.set(comp.id, pastComp);
      eventsById.get(event.id)!.competitions.push(pastComp);
    }

    pastComp.publishedRounds++;
    if (
      !pastComp.latestPublishedAt ||
      (round.published_at && round.published_at > pastComp.latestPublishedAt)
    ) {
      pastComp.latestPublishedAt = round.published_at;
    }

    if (
      round.round_type === "final" &&
      round.scoring_mode === "relative_placement" &&
      pastComp.podium == null
    ) {
      pastComp.podium = extractPodium(round.tabulation);
    }
  }

  const past = [...eventsById.values()].sort((a, b) => {
    const aTime = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const bTime = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return bTime - aTime;
  });

  return NextResponse.json({ upcoming, live, past, includeTest });
}
