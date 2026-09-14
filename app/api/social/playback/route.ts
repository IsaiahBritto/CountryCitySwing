import { NextResponse } from "next/server";
import { getSocialPlayback } from "@/lib/spotify/socialPlayback";

export async function GET() {
  try {
    const payload = await getSocialPlayback();
    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Social playback error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load playback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
