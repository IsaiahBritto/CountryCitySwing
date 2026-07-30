import { describe, expect, it } from "vitest";
import {
  buildPrivateLessonStudentSubject,
  createPrivateLessonStudentEmailHtml,
} from "@/lib/email/privateLessonStudentEmail";

describe("createPrivateLessonStudentEmailHtml", () => {
  it("renders booking email with instructor branding and readable colors", () => {
    const html = createPrivateLessonStudentEmailHtml({
      kind: "booking",
      recipientFirstName: "Brit & Co",
      instructorName: "Alex Smith",
      instructorEmail: "alex@example.com",
      lessonDateFormatted: "Monday, April 20, 2026",
      lessonTime: "7:00 PM CT",
      lessonDuration: 60,
      lessonFocus: "Spins & connection",
      lessonPrice: 85,
      lessonLocation: "Downtown Studio",
      disclaimer: "Please arrive 5 minutes early <thanks>",
    });

    expect(html).toContain("Alex Smith");
    expect(html).toContain("Private Lesson Booking Confirmation");
    expect(html).toContain("color:#F3F4F6");
    expect(html).toContain("background-color:#111827");
    expect(html).toContain("Brit &amp; Co");
    expect(html).toContain("Spins &amp; connection");
    expect(html).toContain("Please arrive 5 minutes early &lt;thanks&gt;");
    expect(html).toContain("alex@example.com");
    expect(html).toContain("mailto:alex@example.com");
    expect(html).toContain("Private Lesson Signups Powered by Country City Swing");
    expect(html).not.toContain("contact.us@countrycityswing.dance");
  });

  it("renders update variant and omits disclaimer when unset", () => {
    const html = createPrivateLessonStudentEmailHtml({
      kind: "update",
      recipientFirstName: "Taylor",
      instructorName: "Jordan Lee",
      instructorEmail: "jordan@example.com",
      lessonDateFormatted: "Wednesday, April 22, 2026",
      lessonTime: "8:30 PM CT",
      lessonDuration: 45,
    });

    expect(html).toContain("Private Lesson Updated");
    expect(html).toContain("Updated Lesson Details");
    expect(html).toContain("Lesson Details Updated");
    expect(html).toContain("Jordan Lee");
    expect(html).not.toContain(">Disclaimer<");
  });
});

describe("buildPrivateLessonStudentSubject", () => {
  it("includes instructor name and optional location", () => {
    expect(
      buildPrivateLessonStudentSubject("booking", "Alex Smith", "Downtown Studio")
    ).toBe("Private Lesson Booking Confirmation - Alex Smith @ Downtown Studio");
    expect(buildPrivateLessonStudentSubject("update", "Alex Smith", null)).toBe(
      "Private Lesson Updated - Alex Smith"
    );
  });
});
