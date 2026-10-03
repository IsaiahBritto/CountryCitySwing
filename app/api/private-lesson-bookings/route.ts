import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  createPrivateLessonBooking,
  PrivateLessonBookingError,
  type PrivateLessonFocus,
} from "@/lib/privateLessonBooking";
import { getOptionalAuthUserId } from "@/lib/privateLessonApiAuth";

const VALID_FOCUS = new Set<string>([
  "Follow Focused",
  "Lead Focused",
  "Lead/Follow Focused",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      slotId,
      instructorId,
      firstName,
      lastName,
      email,
      phoneNumber,
      lessonFocus,
    } = body;

    if (
      !slotId ||
      !instructorId ||
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !phoneNumber?.trim() ||
      !lessonFocus
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!VALID_FOCUS.has(String(lessonFocus))) {
      return NextResponse.json({ error: "Invalid lesson focus" }, { status: 400 });
    }

    const userId = await getOptionalAuthUserId(req);

    const result = await createPrivateLessonBooking(supabaseServer, {
      slotId: String(slotId),
      instructorId: String(instructorId),
      firstName: String(firstName),
      lastName: String(lastName),
      email: String(email),
      phoneNumber: String(phoneNumber),
      lessonFocus: lessonFocus as PrivateLessonFocus,
      userId,
    });

    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
    });
  } catch (err) {
    if (err instanceof PrivateLessonBookingError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("private-lesson-bookings POST:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
