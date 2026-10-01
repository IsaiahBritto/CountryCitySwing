import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  lookupPrivateLessonBookingByCancelToken,
  PrivateLessonBookingError,
} from "@/lib/privateLessonBooking";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token?.trim()) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const summary = await lookupPrivateLessonBookingByCancelToken(supabaseServer, token);
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    if (err instanceof PrivateLessonBookingError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("private-lesson-bookings lookup:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
