import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { createSession } from "@/lib/spotify/djSessionServer";
import {
  createEmptyPlaybackSnapshot,
  toSessionResponse,
} from "@/lib/spotify/djSession";
import {
  deserializeDjDeckState,
  INITIAL_DJ_DECK_STATE,
} from "@/lib/spotify/djDeckState";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      hostClientId?: string;
      deckState?: unknown;
    };

    if (typeof body.hostClientId !== "string" || !body.hostClientId.trim()) {
      return NextResponse.json(
        { error: "hostClientId is required" },
        { status: 400 }
      );
    }

    const deckState = body.deckState
      ? deserializeDjDeckState(body.deckState)
      : INITIAL_DJ_DECK_STATE;

    const session = await createSession({
      startedBy: auth.userId,
      hostClientId: body.hostClientId.trim(),
      deckState,
      playbackSnapshot: createEmptyPlaybackSnapshot(deckState.activeDeck),
    });

    return NextResponse.json(toSessionResponse(session), { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "ACTIVE_SESSION_EXISTS") {
      return NextResponse.json(
        { error: "An active session already exists" },
        { status: 409 }
      );
    }
    console.error("DJ session start error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to start session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
