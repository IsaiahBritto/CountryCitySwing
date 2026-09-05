import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  getSessionRowById,
  patchSessionState,
} from "@/lib/spotify/djSessionServer";
import {
  parsePlaybackSnapshot,
  toSessionResponse,
} from "@/lib/spotify/djSession";
import { deserializeDjDeckState } from "@/lib/spotify/djDeckState";

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      stateVersion?: number;
      deckState?: unknown;
      playbackSnapshot?: unknown;
      clientId?: string;
    };

    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }
    if (typeof body.stateVersion !== "number") {
      return NextResponse.json(
        { error: "stateVersion is required" },
        { status: 400 }
      );
    }
    if (!body.deckState) {
      return NextResponse.json(
        { error: "deckState is required" },
        { status: 400 }
      );
    }

    const session = await getSessionRowById(body.sessionId.trim());
    if (!session || session.status !== "active") {
      return NextResponse.json(
        { error: "Active session not found" },
        { status: 404 }
      );
    }

    const isHost =
      typeof body.clientId === "string" &&
      body.clientId.trim() === session.host_client_id;

    const result = await patchSessionState({
      sessionId: body.sessionId.trim(),
      expectedVersion: body.stateVersion,
      deckState: deserializeDjDeckState(body.deckState),
      playbackSnapshot: body.playbackSnapshot
        ? parsePlaybackSnapshot(body.playbackSnapshot)
        : undefined,
      clientId: body.clientId ?? "",
      isHost,
    });

    if (result === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Active session not found" },
        { status: 404 }
      );
    }
    if (result === "VERSION_CONFLICT") {
      const latest = await getSessionRowById(body.sessionId.trim());
      return NextResponse.json(
        {
          error: "State version conflict",
          session: latest ? toSessionResponse(latest) : null,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(toSessionResponse(result));
  } catch (error: unknown) {
    console.error("DJ session state patch error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
