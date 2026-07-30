import { NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import { createPrivateLessonInstructorBookingEmailHtml } from "@/lib/email/privateLessonInstructorEmail";

export async function POST(req: Request) {
  try {
    const {
      instructorId,
      studentFirstName,
      studentLastName,
      studentEmail,
      studentPhone,
      lessonDate,
      lessonTime,
      lessonDuration,
      lessonFocus,
      lessonPrice,
      lessonLocation,
    } = await req.json();

    if (!instructorId || !studentEmail || !lessonDate || !lessonTime) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: instructorProfile, error: instructorError } = await supabaseServer
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", instructorId)
      .single();

    if (instructorError || !instructorProfile?.email) {
      console.error("Error fetching instructor profile:", instructorError);
      return NextResponse.json(
        { error: "Instructor not found" },
        { status: 404 }
      );
    }

    const formattedDate = new Date(lessonDate).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const studentName =
      `${studentFirstName || ""} ${studentLastName || ""}`.trim() || "Student";

    const html = createPrivateLessonInstructorBookingEmailHtml({
      instructorFirstName: instructorProfile.first_name || "Instructor",
      studentName,
      studentEmail,
      studentPhone,
      lessonDateFormatted: formattedDate,
      lessonTime,
      lessonDuration,
      lessonFocus,
      lessonPrice,
      lessonLocation,
    });

    await sendHtmlEmail(
      instructorProfile.email,
      `New Private Lesson Booking - ${studentName} - Country City Swing`,
      html,
      "confirmation@countrycityswing.dance"
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Instructor notification email error:", err);
    return NextResponse.json(
      { error: "Failed to send instructor notification email" },
      { status: 500 }
    );
  }
}
