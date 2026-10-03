import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { loadCountrySwingVerifyRows } from "@/lib/spotify/verifyMusic";
import { spotifyBffErrorResponse } from "@/lib/spotify/spotifyBffResponse";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const lookupMissing =
      req.nextUrl.searchParams.get("lookupMissing") === "true";

    const data = await loadCountrySwingVerifyRows({ lookupMissing });
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Verify music load error:", error);
    return spotifyBffErrorResponse(error, "Failed to load verify music tracks");
  }
}
