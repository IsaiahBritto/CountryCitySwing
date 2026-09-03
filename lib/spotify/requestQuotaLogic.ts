import {
  GENRE_LABELS,
  getLimitForGenre,
  type RequestLimits,
} from "@/lib/spotify/requestLimits";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { SocialRequestError } from "@/lib/spotify/socialRequestError";

export function getRemainingQuota(input: {
  limits: RequestLimits | null;
  used: Partial<Record<GenrePool, number>>;
  availableGenres: GenrePool[];
}): Partial<Record<GenrePool, number | null>> {
  const remaining: Partial<Record<GenrePool, number | null>> = {};
  for (const genre of input.availableGenres) {
    const limit = getLimitForGenre(input.limits, genre);
    if (limit == null) {
      remaining[genre] = null;
      continue;
    }
    const used = input.used[genre] ?? 0;
    remaining[genre] = Math.max(0, limit - used);
  }
  return remaining;
}

export function assertCanRequest(input: {
  genre: GenrePool;
  limits: RequestLimits | null;
  counts: Partial<Record<GenrePool, number>>;
}): void {
  const limit = getLimitForGenre(input.limits, input.genre);
  if (limit == null) return;

  if (limit === 0) {
    throw new SocialRequestError(
      `${GENRE_LABELS[input.genre]} requests aren’t open tonight.`,
      403
    );
  }

  const used = input.counts[input.genre] ?? 0;
  if (used >= limit) {
    const label = GENRE_LABELS[input.genre];
    throw new SocialRequestError(
      limit === 1
        ? `You’ve used your ${label} request for tonight.`
        : `You’ve used all ${limit} ${label} requests for tonight.`,
      403
    );
  }
}
