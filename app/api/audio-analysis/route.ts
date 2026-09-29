import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  resolveAudioAnalysisForApi,
  type AnalysisTrackInput,
} from "@/lib/audioAnalysis/service";

export const maxDuration = 300;

const MAX_TRACKS_PER_REQUEST = 200;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      tracks?: Array<{ spotifyTrackId?: string; isrc?: string | null }>;
    };

    const raw = body.tracks;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json(
        { error: "tracks array is required" },
        { status: 400 }
      );
    }
    if (raw.length > MAX_TRACKS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_TRACKS_PER_REQUEST} tracks per request` },
        { status: 400 }
      );
    }

    const tracks: AnalysisTrackInput[] = [];
    for (const item of raw) {
      const spotifyTrackId =
        typeof item.spotifyTrackId === "string"
          ? item.spotifyTrackId.trim()
          : "";
      if (!spotifyTrackId) continue;
      tracks.push({
        spotifyTrackId,
        isrc:
          typeof item.isrc === "string"
            ? item.isrc
            : item.isrc === null
              ? null
              : null,
      });
    }

    if (tracks.length === 0) {
      return NextResponse.json(
        { error: "No valid tracks in request" },
        { status: 400 }
      );
    }

    const result = await resolveAudioAnalysisForApi(tracks, {
      allowExternalLookup: true,
      retryMode: "bpm_energy",
    });

    return NextResponse.json({ tracks: result });
  } catch (error: unknown) {
    console.error("audio-analysis error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to resolve audio analysis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
