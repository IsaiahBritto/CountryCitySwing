import { NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  buildPrivateLessonStudentSubject,
  createPrivateLessonStudentEmailHtml,
} from "@/lib/email/privateLessonStudentEmail";

export async function POST(req: Request) {
  try {
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
    } = await req.json();

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
      `${instructorName} <confirmation@countrycityswing.dance>`,
      undefined,
      undefined,
      instructorProfile.email
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Lesson booking email error:", err);
    return NextResponse.json(
      { error: "Failed to send confirmation email" },
      { status: 500 }
    );
  }
}
