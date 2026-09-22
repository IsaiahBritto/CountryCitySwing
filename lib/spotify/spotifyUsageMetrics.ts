import { supabaseServer } from "@/lib/supabaseServer";

export type UsageRollupKind = "ok" | "429" | "blocked_local" | "cache_hit";

function hourStartIso(d = new Date()): string {
  const h = new Date(d);
  h.setUTCMinutes(0, 0, 0);
  return h.toISOString();
}

export async function incrementUsageRollup(
  endpointGroup: string,
  kind: UsageRollupKind
): Promise<void> {
  const hourStart = hourStartIso();
  const column =
    kind === "ok"
      ? "count_ok"
      : kind === "429"
        ? "count_429"
        : kind === "blocked_local"
          ? "count_blocked_local"
          : "count_cache_hit";

  const { data: existing } = await supabaseServer
    .from("spotify_api_usage_rollups")
    .select(column)
    .eq("hour_start", hourStart)
    .eq("endpoint_group", endpointGroup)
    .maybeSingle();

  const prev =
    existing && typeof (existing as Record<string, unknown>)[column] === "number"
      ? ((existing as Record<string, number>)[column] ?? 0)
      : 0;

  const patch: Record<string, string | number> = {
    hour_start: hourStart,
    endpoint_group: endpointGroup,
    [column]: prev + 1,
  };

  const { error } = await supabaseServer
    .from("spotify_api_usage_rollups")
    .upsert(patch, { onConflict: "hour_start,endpoint_group" });

  if (error) {
    console.warn("spotify_api_usage_rollups upsert failed:", error.message);
  }
}
