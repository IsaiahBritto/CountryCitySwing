import { NextResponse } from "next/server";
import { isSpotifyApiFetchError } from "@/lib/spotify/spotifyApiFetchError";
import { SpotifyQuotaBlockedError } from "@/lib/spotify/spotifyQuotaGate";
import { getQuotaBlockedUntilIso } from "@/lib/spotify/spotifyQuotaGate";

export type SpotifyBffErrorCode =
  | "SPOTIFY_QUOTA_EXCEEDED"
  | "SPOTIFY_RATE_LIMITED"
  | "SPOTIFY_AUTH"
  | "SPOTIFY_ERROR";

export function spotifyBffErrorResponse(
  error: unknown,
  fallbackMessage: string
): NextResponse {
  if (error instanceof SpotifyQuotaBlockedError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "SPOTIFY_QUOTA_EXCEEDED" as const,
        retryAfterSec: Math.max(
          0,
          Math.ceil((error.blockedUntil.getTime() - Date.now()) / 1000)
        ),
        quotaBlockedUntil: error.blockedUntil.toISOString(),
      },
      { status: 503 }
    );
  }

  if (isSpotifyApiFetchError(error)) {
    if (error.isQuotaExceeded || error.httpStatus === 429) {
      return NextResponse.json(
        {
          error: error.message,
          code: "SPOTIFY_QUOTA_EXCEEDED" as const,
          retryAfterSec: error.retryAfterSec,
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      {
        error: error.message,
        code: "SPOTIFY_ERROR" as const,
      },
      { status: error.httpStatus >= 400 ? error.httpStatus : 500 }
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json(
    { error: message, code: "SPOTIFY_ERROR" as const },
    { status: 500 }
  );
}

export async function spotifyStaleMeta(): Promise<{
  stale: boolean;
  quotaBlockedUntil: string | null;
}> {
  const quotaBlockedUntil = await getQuotaBlockedUntilIso();
  return {
    stale: Boolean(quotaBlockedUntil),
    quotaBlockedUntil,
  };
}

export function jsonWithSpotifyMeta<T extends Record<string, unknown>>(
  body: T,
  meta: { stale: boolean; quotaBlockedUntil: string | null }
): NextResponse {
  return NextResponse.json({
    ...body,
    stale: meta.stale,
    quotaBlockedUntil: meta.quotaBlockedUntil,
  });
}
