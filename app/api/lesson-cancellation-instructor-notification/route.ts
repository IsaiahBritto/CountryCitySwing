import { NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import { createPrivateLessonInstructorCancelEmailHtml } from "@/lib/email/privateLessonInstructorEmail";

export async function POST(req: Request) {
  try {
    const {
      instructorId,
      studentName,
      studentEmail,
      lessonDate,
      lessonTime,
    } = await req.json();

    if (!instructorId || !lessonDate || !lessonTime) {
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

    const displayStudent =
      studentName || studentEmail || "Student";

    const html = createPrivateLessonInstructorCancelEmailHtml({
      instructorFirstName: instructorProfile.first_name || "Instructor",
      studentName: displayStudent,
      studentEmail,
      lessonDateFormatted: formattedDate,
      lessonTime,
    });

    await sendHtmlEmail(
      instructorProfile.email,
      `Lesson Booking Cancelled - Country City Swing`,
      html,
      "confirmation@countrycityswing.dance"
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Instructor cancellation notification email error:", err);
    return NextResponse.json(
      { error: "Failed to send instructor notification email" },
      { status: 500 }
    );
  }
}
