import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { appleMusicConfigured } from "@/lib/appleMusic/config";
import { getCachedAppleDeveloperToken } from "@/lib/appleMusic/developerToken";

const MIN_INTERVAL_MS = 2000;
const lastIssuedByUser = new Map<string, number>();

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    if (!appleMusicConfigured()) {
      return NextResponse.json(
        {
          error:
            "Apple Music is not configured. Set APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY.",
        },
        { status: 503 }
      );
    }

    const now = Date.now();
    const last = lastIssuedByUser.get(auth.userId) ?? 0;
    if (now - last < MIN_INTERVAL_MS) {
      return NextResponse.json(
        { error: "Developer token requests are rate limited" },
        { status: 429 }
      );
    }
    lastIssuedByUser.set(auth.userId, now);

    const { token, expiresAt } = getCachedAppleDeveloperToken(now);
    return NextResponse.json({
      developerToken: token,
      expiresAt,
    });
  } catch (error: unknown) {
    console.error("Apple Music developer-token error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to issue developer token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
