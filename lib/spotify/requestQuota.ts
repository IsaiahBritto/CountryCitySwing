import type { GenrePool } from "@/lib/spotify/playlistIds";
import type { RequestLimits } from "@/lib/spotify/requestLimits";
import type { RequestRefreshMinutes } from "@/lib/spotify/requestRefresh";
import {
  countActiveByGenre,
  filterActiveRequests,
  nextAvailableAtForGenre,
  type ActiveRequestRow,
} from "@/lib/spotify/requestQuotaLogic";
import { getRemainingQuota } from "@/lib/spotify/requestQuotaLogic";
import { supabaseServer } from "@/lib/supabaseServer";

export {
  assertCanRequest,
  getRemainingQuota,
  formatNextAvailableTime,
} from "@/lib/spotify/requestQuotaLogic";

export type QuotaSnapshot = {
  limits: RequestLimits | null;
  used: Partial<Record<GenrePool, number>>;
  remaining: Partial<Record<GenrePool, number | null>>;
  availableGenres: GenrePool[];
  refreshMinutes: RequestRefreshMinutes;
  nextAvailableAt: Partial<Record<GenrePool, string | null>>;
};

type RequestCountInput = {
  activationId: string;
  refreshMinutes: number;
  requesterUserId: string | null;
  requesterToken: string | null;
  genres: GenrePool[];
  nowMs?: number;
};

async function loadActiveRequestRows(
  input: RequestCountInput
): Promise<ActiveRequestRow[]> {
  if (!input.requesterUserId && !input.requesterToken) {
    return [];
  }

  let query = supabaseServer
    .from("social_song_requests")
    .select("genre, created_at")
    .eq("activation_id", input.activationId)
    .neq("result", "rejected")
    .in("genre", input.genres);

  if (input.requesterUserId) {
    query = query.eq("requester_user_id", input.requesterUserId);
  } else if (input.requesterToken) {
    query = query.eq("requester_token", input.requesterToken);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load request counts: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    genre: row.genre as GenrePool,
    createdAt: row.created_at as string,
  }));
}

export async function getRequestCounts(
  input: RequestCountInput
): Promise<Partial<Record<GenrePool, number>>> {
  const nowMs = input.nowMs ?? Date.now();
  const rows = await loadActiveRequestRows(input);
  const active = filterActiveRequests(rows, input.refreshMinutes, nowMs);
  return countActiveByGenre(active, input.genres);
}

export async function buildQuotaSnapshot(input: {
  activationId: string;
  refreshMinutes: RequestRefreshMinutes;
  requestLimits: RequestLimits | null;
  availableGenres: GenrePool[];
  requesterUserId: string | null;
  requesterToken: string | null;
  nowMs?: number;
}): Promise<QuotaSnapshot> {
  const nowMs = input.nowMs ?? Date.now();
  const rows = await loadActiveRequestRows({
    activationId: input.activationId,
    refreshMinutes: input.refreshMinutes,
    requesterUserId: input.requesterUserId,
    requesterToken: input.requesterToken,
    genres: input.availableGenres,
    nowMs,
  });
  const active = filterActiveRequests(rows, input.refreshMinutes, nowMs);
  const used = countActiveByGenre(active, input.availableGenres);

  const nextAvailableAt: Partial<Record<GenrePool, string | null>> = {};
  for (const genre of input.availableGenres) {
    const limit = input.requestLimits?.[genre];
    if (limit == null || limit === 0) {
      nextAvailableAt[genre] = null;
      continue;
    }
    const genreRows = rows.filter((row) => row.genre === genre);
    nextAvailableAt[genre] = nextAvailableAtForGenre({
      rows: genreRows,
      limit,
      refreshMinutes: input.refreshMinutes,
      nowMs,
    });
  }

  return {
    limits: input.requestLimits,
    used,
    remaining: getRemainingQuota({
      limits: input.requestLimits,
      used,
      availableGenres: input.availableGenres,
    }),
    availableGenres: input.availableGenres,
    refreshMinutes: input.refreshMinutes,
    nextAvailableAt,
  };
}
