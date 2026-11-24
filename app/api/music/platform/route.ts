import { NextResponse } from "next/server";
import { getEffectiveMusicProvider } from "@/lib/music/platformSettings";

export async function GET() {
  try {
    const { provider, source } = await getEffectiveMusicProvider();
    return NextResponse.json({ provider, source });
  } catch (error: unknown) {
    console.error("GET /api/music/platform error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load music platform";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
