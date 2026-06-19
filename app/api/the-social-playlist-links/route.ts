import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  getTheSocialPlaylistLinks,
  replaceTheSocialPlaylistLinks,
  validateTheSocialPlaylistLinks,
} from "@/lib/theSocialPlaylistLinks";

export async function GET() {
  try {
    const links = await getTheSocialPlaylistLinks();
    return NextResponse.json({ links });
  } catch (error: unknown) {
    console.error("Error fetching the social playlist links:", error);
    return NextResponse.json(
      { error: "Failed to fetch playlist links" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const validated = validateTheSocialPlaylistLinks(body?.links);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const links = await replaceTheSocialPlaylistLinks(validated.links);
    return NextResponse.json({ links });
  } catch (error: unknown) {
    console.error("Error saving the social playlist links:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save playlist links";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
