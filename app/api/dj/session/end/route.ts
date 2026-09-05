import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { endSession, getSessionRowById } from "@/lib/spotify/djSessionServer";
import { toSessionResponse } from "@/lib/spotify/djSession";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
    };

    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const existing = await getSessionRowById(body.sessionId.trim());
    if (!existing || existing.status !== "active") {
      return NextResponse.json(
        { error: "Active session not found" },
        { status: 404 }
      );
    }

    const session = await endSession(body.sessionId.trim());
    if (!session) {
      return NextResponse.json(
        { error: "Active session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(toSessionResponse(session));
  } catch (error: unknown) {
    console.error("DJ session end error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to end session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
