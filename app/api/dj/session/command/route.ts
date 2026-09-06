import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getSessionRowById } from "@/lib/spotify/djSessionServer";
import { canExecutePlayback, toSessionResponse } from "@/lib/spotify/djSession";
import {
  createCommandBroadcast,
  parseDjSessionCommand,
} from "@/lib/spotify/djSessionCommands";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      clientId?: string;
      command?: unknown;
    };

    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }
    if (typeof body.clientId !== "string" || !body.clientId.trim()) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 }
      );
    }

    const command = parseDjSessionCommand(body.command);
    if (!command) {
      return NextResponse.json({ error: "Invalid command" }, { status: 400 });
    }

    const session = await getSessionRowById(body.sessionId.trim());
    if (!session || session.status !== "active") {
      return NextResponse.json(
        { error: "Active session not found" },
        { status: 404 }
      );
    }

    const isHost = session.host_client_id === body.clientId.trim();
    if (!isHost && !canExecutePlayback(session)) {
      return NextResponse.json(
        {
          error: "Playback host is offline",
          session: toSessionResponse(session),
        },
        { status: 409 }
      );
    }

    const broadcast = createCommandBroadcast(command, body.clientId.trim());

    return NextResponse.json({
      ok: true,
      broadcast,
      session: toSessionResponse(session),
      executeLocally: isHost,
    });
  } catch (error: unknown) {
    console.error("DJ session command error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send command";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
