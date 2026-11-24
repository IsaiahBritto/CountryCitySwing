import { NextRequest, NextResponse } from "next/server";
import { deliverPendingGiftCardEmails } from "@/lib/giftCards/delivery";

function authorizeCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === "development";
  const q = req.nextUrl.searchParams.get("secret");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return q === cronSecret || bearer === cronSecret;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await deliverPendingGiftCardEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("deliver-scheduled", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}