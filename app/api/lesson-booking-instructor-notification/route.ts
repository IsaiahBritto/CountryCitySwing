import { NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";

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

    // Fetch instructor email
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

    const studentName = `${studentFirstName || ""} ${studentLastName || ""}`.trim() || "Student";

    const html = `
      <div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto">
        <h2 style="color:#F2C94C;margin-bottom:20px">New Private Lesson Booking</h2>
        <p style="font-size:16px;line-height:1.6">Hi ${instructorProfile.first_name || "Instructor"},</p>
        <p style="font-size:16px;line-height:1.6">You have a new private lesson booking!</p>
        
        <div style="background-color:#1a1a1a;padding:20px;border-radius:8px;margin:20px 0">
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Student:</strong> ${studentName}</p>
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Email:</strong> ${studentEmail}</p>
          ${studentPhone ? `<p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Phone:</strong> ${studentPhone}</p>` : ""}
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Date:</strong> ${formattedDate}</p>
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Time:</strong> ${lessonTime}</p>
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Duration:</strong> ${lessonDuration} minutes</p>
          ${lessonPrice ? `<p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Price:</strong> $${lessonPrice.toFixed(2)}</p>` : ""}
          ${lessonFocus ? `<p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Focus:</strong> ${lessonFocus}</p>` : ""}
          ${lessonLocation ? `<p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Location:</strong> ${lessonLocation}</p>` : ""}
        </div>

        <p style="font-size:16px;line-height:1.6">The student has been sent a confirmation email. You can view and manage this booking in your instructor dashboard.</p>
        <p style="margin-top:30px;color:#888;font-size:14px">— The Country City Swing Team</p>
      </div>`;

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
