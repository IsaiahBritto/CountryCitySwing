import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getActiveSessionRow } from "@/lib/spotify/djSessionServer";
import { toSessionResponse } from "@/lib/spotify/djSession";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const session = await getActiveSessionRow();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }

    return NextResponse.json(toSessionResponse(session));
  } catch (error: unknown) {
    console.error("DJ session active error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
