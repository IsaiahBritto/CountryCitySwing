import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { takeoverSession } from "@/lib/spotify/djSessionServer";
import { parsePlaybackSnapshot, toSessionResponse } from "@/lib/spotify/djSession";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      hostClientId?: string;
      hostDeviceId?: string;
      playbackSnapshot?: unknown;
    };

    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }
    if (typeof body.hostClientId !== "string" || !body.hostClientId.trim()) {
      return NextResponse.json(
        { error: "hostClientId is required" },
        { status: 400 }
      );
    }
    if (typeof body.hostDeviceId !== "string" || !body.hostDeviceId.trim()) {
      return NextResponse.json(
        { error: "hostDeviceId is required" },
        { status: 400 }
      );
    }

    const result = await takeoverSession({
      sessionId: body.sessionId.trim(),
      hostClientId: body.hostClientId.trim(),
      hostDeviceId: body.hostDeviceId.trim(),
      playbackSnapshot: body.playbackSnapshot
        ? parsePlaybackSnapshot(body.playbackSnapshot)
        : undefined,
    });

    if (result === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Active session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(toSessionResponse(result));
  } catch (error: unknown) {
    console.error("DJ session takeover error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to take over session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
