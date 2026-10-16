import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { persistAppleMusicUserToken } from "@/lib/appleMusic/sessionCredentials";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const musicUserToken = (body as { musicUserToken?: string }).musicUserToken?.trim();
    const storefrontId =
      (body as { storefrontId?: string | null }).storefrontId?.trim() || null;

    if (!musicUserToken) {
      return NextResponse.json({ error: "musicUserToken is required" }, { status: 400 });
    }

    await persistAppleMusicUserToken({ musicUserToken, storefrontId });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("register-user-token error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to register user token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
