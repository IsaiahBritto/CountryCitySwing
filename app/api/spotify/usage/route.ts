import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const sinceParam = req.nextUrl.searchParams.get("since");
    const since = sinceParam
      ? new Date(sinceParam)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (Number.isNaN(since.getTime())) {
      return NextResponse.json({ error: "Invalid since parameter" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("spotify_api_usage_rollups")
      .select(
        "hour_start, endpoint_group, count_ok, count_429, count_blocked_local, count_cache_hit"
      )
      .gte("hour_start", since.toISOString())
      .order("hour_start", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const totals = {
      count_ok: 0,
      count_429: 0,
      count_blocked_local: 0,
      count_cache_hit: 0,
    };
    for (const row of data ?? []) {
      totals.count_ok += row.count_ok ?? 0;
      totals.count_429 += row.count_429 ?? 0;
      totals.count_blocked_local += row.count_blocked_local ?? 0;
      totals.count_cache_hit += row.count_cache_hit ?? 0;
    }

    return NextResponse.json({
      since: since.toISOString(),
      rows: data ?? [],
      totals,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
