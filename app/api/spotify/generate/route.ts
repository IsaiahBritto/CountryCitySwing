import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { generateSocialPlaylist } from "@/lib/spotify/generate";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      lookupFeatures?: boolean;
    };
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const result = await generateSocialPlaylist(body.name, {
      lookupFeatures: body.lookupFeatures === true,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Spotify generate error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate playlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
