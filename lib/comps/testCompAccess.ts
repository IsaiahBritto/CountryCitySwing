import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";

/** True when an admin requests test fixtures via ?include_test=1. */
export async function includeTestFixtures(req: NextRequest): Promise<boolean> {
  if (req.nextUrl.searchParams.get("include_test") !== "1") return false;
  const auth = await requireAdminAuth(req);
  return auth.ok;
}
