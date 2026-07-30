import { NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  buildPrivateLessonStudentSubject,
  createPrivateLessonStudentEmailHtml,
} from "@/lib/email/privateLessonStudentEmail";

const STUDENT_FROM = "confirmation@countrycityswing.dance";

async function markConfirmationEmailFailed(bookingId: string | undefined) {
  if (!bookingId) return;
  const { error } = await supabaseServer
    .from("lesson_bookings")
    .update({ student_confirmation_email_sent: false })
    .eq("id", bookingId);
  if (error) {
    console.error("Failed to mark student confirmation email as unsent:", error);
  }
}

export async function POST(req: Request) {
  let bookingId: string | undefined;
  try {
    const body = await req.json();
    bookingId = body.bookingId;
    const {
      instructorId,
      studentEmail,
      firstName,
      lessonDate,
      lessonTime,
      lessonDuration,
      lessonFocus,
      lessonPrice,
      lessonLocation,
    } = body;

    if (!instructorId || !studentEmail || !firstName || !lessonDate || !lessonTime) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: instructorProfile, error: instructorError } = await supabaseServer
      .from("profiles")
      .select("email, first_name, last_name, private_lesson_disclaimer")
      .eq("id", instructorId)
      .single();

    if (instructorError || !instructorProfile?.email) {
      console.error("Error fetching instructor profile:", instructorError);
      await markConfirmationEmailFailed(bookingId);
      return NextResponse.json(
        { error: "Instructor not found" },
        { status: 404 }
      );
    }

    const instructorName =
      `${instructorProfile.first_name || ""} ${instructorProfile.last_name || ""}`.trim() ||
      "Your Instructor";

    const formattedDate = new Date(lessonDate).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const html = createPrivateLessonStudentEmailHtml({
      kind: "booking",
      recipientFirstName: firstName,
      instructorName,
      instructorEmail: instructorProfile.email,
      lessonDateFormatted: formattedDate,
      lessonTime,
      lessonDuration,
      lessonFocus,
      lessonPrice,
      lessonLocation,
      disclaimer: instructorProfile.private_lesson_disclaimer,
    });

    const subject = buildPrivateLessonStudentSubject(
      "booking",
      instructorName,
      lessonLocation
    );

    await sendHtmlEmail(
      studentEmail,
      subject,
      html,
      STUDENT_FROM,
      undefined,
      undefined,
      instructorProfile.email
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Lesson booking email error:", err);
    await markConfirmationEmailFailed(bookingId);
    return NextResponse.json(
      { error: "Failed to send confirmation email" },
      { status: 500 }
    );
  }
}
