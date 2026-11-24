import { NextRequest, NextResponse } from "next/server";
import { loadCcsSiteAdminDisplayNames } from "@/lib/ccsSiteAdmins";
import { loadOrganizedEventsForUser } from "@/lib/compEventAccess";
import {
  isSiteAdmin,
  requireAuthenticatedProfile,
} from "@/lib/nonCcsEventAuth";

/** GET: CCS site admin names for Non-CCS host UI (organizers or site admins). */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;

  if (!isSiteAdmin(auth.role)) {
    const organized = await loadOrganizedEventsForUser(auth.userId);
    if (organized.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const admins = await loadCcsSiteAdminDisplayNames();
  return NextResponse.json({ ccs_site_admins: admins });
}
