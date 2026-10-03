import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  cancelPrivateLessonBooking,
  PrivateLessonBookingError,
} from "@/lib/privateLessonBooking";
import { getOptionalAuthUserId } from "@/lib/privateLessonApiAuth";
import { DEFAULT_TIME_ZONE, formatTimeRangeWithTimeZone } from "@/lib/utils/dateHelpers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cancelToken = body.cancelToken ? String(body.cancelToken) : undefined;
    const bookingId = body.bookingId ? String(body.bookingId) : undefined;
    const userId = await getOptionalAuthUserId(req);

    const result = await cancelPrivateLessonBooking(supabaseServer, {
      cancelToken,
      bookingId,
      userId: userId ?? undefined,
    });

    const tz = result.timeZone || DEFAULT_TIME_ZONE;
    const { startTime, tzAbbrev } = formatTimeRangeWithTimeZone(
      result.lessonStart,
      result.lessonEnd,
      tz
    );
    const lessonTime = `${startTime}${tzAbbrev ? ` ${tzAbbrev}` : ""}`;

    try {
      await fetch(`${req.nextUrl.origin}/api/lesson-cancellation-instructor-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructorId: result.instructorId,
          studentName: result.studentName,
          studentEmail: result.studentEmail,
          lessonDate: result.lessonStart,
          lessonTime,
        }),
      });
    } catch (emailErr) {
      console.error("Instructor cancel notification failed:", emailErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof PrivateLessonBookingError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("private-lesson-bookings cancel:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
