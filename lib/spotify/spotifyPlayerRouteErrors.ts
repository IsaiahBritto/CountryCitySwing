import { NextResponse } from "next/server";
import {
  parseSpotifyApiError,
  type SpotifyPlayerError,
} from "@/lib/spotify/spotifyApiErrors";

export function jsonSpotifyPlayerError(
  raw: unknown,
  status: number
): NextResponse<{ error: SpotifyPlayerError }> {
  return NextResponse.json(
    { error: parseSpotifyApiError(raw, status) },
    { status }
  );
}
