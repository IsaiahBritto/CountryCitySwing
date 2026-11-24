import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { searchCatalogSongs } from "@/lib/appleMusic/client";
import { getCachedAppleDeveloperToken } from "@/lib/appleMusic/developerToken";
import {
  musicUserTokenFromRequest,
  storefrontFromRequest,
} from "@/lib/appleMusic/requestHeaders";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json({ error: "Missing q" }, { status: 400 });
    }

    const { token } = getCachedAppleDeveloperToken();
    const tracks = await searchCatalogSongs({
      developerToken: token,
      musicUserToken: musicUserTokenFromRequest(req),
      storefront: storefrontFromRequest(req),
      term: q,
      limit: 25,
    });

    return NextResponse.json({ tracks });
  } catch (error: unknown) {
    console.error("Apple Music search error:", error);
    const message =
      error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
