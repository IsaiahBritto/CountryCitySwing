import { NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";

export async function POST(req: Request) {
  try {
    const {
      studentEmail,
      firstName,
      lastName,
      instructorName,
      lessonDate,
      lessonTime,
      lessonDuration,
      lessonFocus,
      lessonPrice,
    } = await req.json();

    if (!studentEmail || !firstName || !lessonDate || !lessonTime) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const formattedDate = new Date(lessonDate).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const html = `
      <div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto">
        <h2 style="color:#F2C94C;margin-bottom:20px">Private Lesson Booking Confirmation</h2>
        <p style="font-size:16px;line-height:1.6">Hi ${firstName},</p>
        <p style="font-size:16px;line-height:1.6">Your private lesson has been confirmed!</p>
        
        <div style="background-color:#1a1a1a;padding:20px;border-radius:8px;margin:20px 0">
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Instructor:</strong> ${instructorName}</p>
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Date:</strong> ${formattedDate}</p>
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Time:</strong> ${lessonTime}</p>
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Duration:</strong> ${lessonDuration} minutes</p>
          ${lessonPrice ? `<p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Price:</strong> $${lessonPrice.toFixed(2)}</p>` : ""}
          ${lessonFocus ? `<p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Focus:</strong> ${lessonFocus}</p>` : ""}
        </div>

        <p style="font-size:16px;line-height:1.6">We're excited to work with you! If you need to cancel or reschedule, please contact us as soon as possible.</p>
        <p style="margin-top:30px;color:#888;font-size:14px">— The Country City Swing Team</p>
      </div>`;

    await sendHtmlEmail(
      studentEmail,
      "Private Lesson Booking Confirmation - Country City Swing",
      html,
      "signup.confirmation@countrycityswing.dance"
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
