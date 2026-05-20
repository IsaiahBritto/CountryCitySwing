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
      lessonLocation,
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
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 20px; }
            .lesson-details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Country City Swing</h1>
              <h2>Private Lesson Booking Confirmation</h2>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>Your private lesson has been confirmed!</p>
              
              <div class="lesson-details">
                <h3>Lesson Details</h3>
                <p><strong>Instructor:</strong> ${instructorName}</p>
                <p><strong>Date:</strong> ${formattedDate}</p>
                <p><strong>Time:</strong> ${lessonTime}</p>
                <p><strong>Duration:</strong> ${lessonDuration} minutes</p>
                ${lessonPrice ? `<p><strong>Price:</strong> $${lessonPrice.toFixed(2)}</p>` : ""}
                ${lessonFocus ? `<p><strong>Focus:</strong> ${lessonFocus}</p>` : ""}
                ${lessonLocation ? `<p><strong>Location:</strong> ${lessonLocation}</p>` : ""}
              </div>
              
              <p>We're excited to work with you! If you need to cancel or reschedule, please contact us as soon as possible.</p>
              
              <p style="margin-top: 20px; font-size: 0.9em; color: #666;">If you have any questions, please contact us at contact.us@countrycityswing.dance</p>
            </div>
            <div class="footer">
              <p>Country City Swing<br>Nashville, TN</p>
            </div>
          </div>
        </body>
      </html>`;

    await sendHtmlEmail(
      studentEmail,
      "Private Lesson Booking Confirmation - Country City Swing",
      html,
      "confirmation@countrycityswing.dance"
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
