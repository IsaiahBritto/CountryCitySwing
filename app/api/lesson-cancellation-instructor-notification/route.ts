import { NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Fetch instructor email
    const { data: instructorProfile, error: instructorError } = await supabase
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

    const html = `
      <div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto">
        <h2 style="color:#F2C94C;margin-bottom:20px">Lesson Booking Cancelled</h2>
        <p style="font-size:16px;line-height:1.6">Hi ${instructorProfile.first_name || "Instructor"},</p>
        <p style="font-size:16px;line-height:1.6">A private lesson booking has been cancelled.</p>
        
        <div style="background-color:#1a1a1a;padding:20px;border-radius:8px;margin:20px 0">
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Student:</strong> ${studentName || studentEmail || "Student"}</p>
          ${studentEmail ? `<p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Email:</strong> ${studentEmail}</p>` : ""}
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Date:</strong> ${formattedDate}</p>
          <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">Time:</strong> ${lessonTime}</p>
        </div>

        <p style="font-size:16px;line-height:1.6">The slot is now available for booking again. You can view and manage your slots in your instructor dashboard.</p>
        <p style="margin-top:30px;color:#888;font-size:14px">— The Country City Swing Team</p>
      </div>`;

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
