import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  getActiveSessionRow,
  refreshHostStatus,
} from "@/lib/spotify/djSessionServer";
import { inferSessionRole, toSessionResponse } from "@/lib/spotify/djSession";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      clientId?: string;
    };

    if (typeof body.clientId !== "string" || !body.clientId.trim()) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 }
      );
    }

    let session = await getActiveSessionRow();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }

    session = await refreshHostStatus(session);
    const role = inferSessionRole(session, body.clientId.trim());

    return NextResponse.json({
      ...toSessionResponse(session),
      role,
    });
  } catch (error: unknown) {
    console.error("DJ session join error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to join session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
