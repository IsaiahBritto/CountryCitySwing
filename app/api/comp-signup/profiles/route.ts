import { NextRequest, NextResponse } from "next/server";
import {
  requireCompSignupAuth,
  searchProfiles,
} from "@/lib/compSignupAuth";

/** GET: search CCS profiles for Strictly partner selection (?q=). */
export async function GET(req: NextRequest) {
  const auth = await requireCompSignupAuth(req);
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const profiles = await searchProfiles(q, auth.profile.id);
  return NextResponse.json({ profiles });
}
