import {
  GENRE_LABELS,
  getLimitForGenre,
  type RequestLimits,
} from "@/lib/spotify/requestLimits";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import {
  requestExpiresAtIso,
  rollingWindowCutoffIso,
} from "@/lib/spotify/requestRefresh";
import { SocialRequestError } from "@/lib/spotify/socialRequestError";

export type ActiveRequestRow = {
  genre: GenrePool;
  createdAt: string;
};

export function filterActiveRequests(
  rows: ActiveRequestRow[],
  refreshMinutes: number,
  nowMs: number
): ActiveRequestRow[] {
  const cutoff = rollingWindowCutoffIso(nowMs, refreshMinutes);
  return rows.filter((row) => row.createdAt > cutoff);
}

export function countActiveByGenre(
  rows: ActiveRequestRow[],
  genres: GenrePool[]
): Partial<Record<GenrePool, number>> {
  const counts: Partial<Record<GenrePool, number>> = {};
  for (const genre of genres) {
    counts[genre] = rows.filter((row) => row.genre === genre).length;
  }
  return counts;
}

export function nextAvailableAtForGenre(input: {
  rows: ActiveRequestRow[];
  limit: number;
  refreshMinutes: number;
  nowMs: number;
}): string | null {
  const active = filterActiveRequests(
    input.rows,
    input.refreshMinutes,
    input.nowMs
  ).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  if (active.length < input.limit) return null;

  const blockingIndex = active.length - input.limit;
  const blockingRequest = active[blockingIndex];
  if (!blockingRequest) return null;

  const expiresAt = requestExpiresAtIso(
    blockingRequest.createdAt,
    input.refreshMinutes
  );
  if (new Date(expiresAt).getTime() <= input.nowMs) return null;
  return expiresAt;
}

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

export function formatNextAvailableTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function assertCanRequest(input: {
  genre: GenrePool;
  limits: RequestLimits | null;
  counts: Partial<Record<GenrePool, number>>;
  nextAvailableAt?: Partial<Record<GenrePool, string | null>>;
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
    const nextAt = input.nextAvailableAt?.[input.genre];
    const retryHint = nextAt
      ? ` Try again after ${formatNextAvailableTime(nextAt)}.`
      : "";
    throw new SocialRequestError(
      limit === 1
        ? `You’ve used your ${label} request.${retryHint}`
        : `You’ve used all ${limit} ${label} requests.${retryHint}`,
      403
    );
  }
}
