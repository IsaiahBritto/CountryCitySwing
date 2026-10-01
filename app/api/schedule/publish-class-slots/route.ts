import { NextRequest, NextResponse } from "next/server";
import { syncDueClassSchedules } from "@/lib/classScheduleSlotsServer";

/**
 * GET - Cron: publish Tuesday Class team slots when schedule_opens_at has passed.
 * Auth: CRON_SECRET via ?secret= or Authorization: Bearer
 */
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const querySecret = req.nextUrl.searchParams.get("secret");
      const authHeader = req.headers.get("authorization");
      const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const provided = querySecret ?? bearerSecret;
      if (provided !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const count = await syncDueClassSchedules();
    return NextResponse.json({ success: true, processed: count });
  } catch (err: unknown) {
    console.error("publish-class-slots cron error:", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
