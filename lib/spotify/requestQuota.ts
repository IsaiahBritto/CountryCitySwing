import type { GenrePool } from "@/lib/spotify/playlistIds";
import type { RequestLimits } from "@/lib/spotify/requestLimits";
import { getRemainingQuota } from "@/lib/spotify/requestQuotaLogic";
import { supabaseServer } from "@/lib/supabaseServer";

export { assertCanRequest, getRemainingQuota } from "@/lib/spotify/requestQuotaLogic";

export type QuotaSnapshot = {
  limits: RequestLimits | null;
  used: Partial<Record<GenrePool, number>>;
  remaining: Partial<Record<GenrePool, number | null>>;
  availableGenres: GenrePool[];
};

export async function getRequestCounts(input: {
  spotifyPlaylistId: string;
  activatedAt: string;
  requesterUserId: string | null;
  requesterToken: string | null;
  genres: GenrePool[];
}): Promise<Partial<Record<GenrePool, number>>> {
  const counts: Partial<Record<GenrePool, number>> = {};

  for (const genre of input.genres) {
    let query = supabaseServer
      .from("social_song_requests")
      .select("id", { count: "exact", head: true })
      .eq("spotify_playlist_id", input.spotifyPlaylistId)
      .eq("genre", genre)
      .neq("result", "rejected")
      .gte("created_at", input.activatedAt);

    if (input.requesterUserId) {
      query = query.eq("requester_user_id", input.requesterUserId);
    } else if (input.requesterToken) {
      query = query.eq("requester_token", input.requesterToken);
    } else {
      counts[genre] = 0;
      continue;
    }

    const { count, error } = await query;
    if (error) {
      throw new Error(`Failed to count requests: ${error.message}`);
    }
    counts[genre] = count ?? 0;
  }

  return counts;
}

export async function buildQuotaSnapshot(input: {
  spotifyPlaylistId: string;
  activatedAt: string;
  requestLimits: RequestLimits | null;
  availableGenres: GenrePool[];
  requesterUserId: string | null;
  requesterToken: string | null;
}): Promise<QuotaSnapshot> {
  const used = await getRequestCounts({
    spotifyPlaylistId: input.spotifyPlaylistId,
    activatedAt: input.activatedAt,
    requesterUserId: input.requesterUserId,
    requesterToken: input.requesterToken,
    genres: input.availableGenres,
  });

  return {
    limits: input.requestLimits,
    used,
    remaining: getRemainingQuota({
      limits: input.requestLimits,
      used,
      availableGenres: input.availableGenres,
    }),
    availableGenres: input.availableGenres,
  };
}
