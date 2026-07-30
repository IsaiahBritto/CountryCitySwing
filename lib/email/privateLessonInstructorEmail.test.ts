import { describe, expect, it } from "vitest";
import { createPrivateLessonInstructorBookingEmailHtml } from "@/lib/email/privateLessonInstructorEmail";
import { formatFromAddress } from "@/lib/email/fromAddress";

describe("createPrivateLessonInstructorBookingEmailHtml", () => {
  it("uses explicit readable colors on detail values", () => {
    const html = createPrivateLessonInstructorBookingEmailHtml({
      instructorFirstName: "Isaiah",
      studentName: "Isaiah Britto",
      studentEmail: "isaiah@example.com",
      studentPhone: "5083146956",
      lessonDateFormatted: "Friday, July 31, 2026",
      lessonTime: "1:00 PM CDT",
      lessonDuration: 60,
      lessonPrice: 800,
      lessonFocus: "Lead Focused",
      lessonLocation: "Isaiah's House",
    });

    expect(html).toContain("background-color:#111827");
    expect(html).toContain("color:#F3F4F6");
    expect(html).toContain("color:#1f2937");
    expect(html).toContain("Isaiah Britto");
    expect(html).toContain("Isaiah&#39;s House");
  });
});

describe("formatFromAddress", () => {
  it("quotes display names with spaces", () => {
    expect(formatFromAddress("Isaiah Britto", "confirmation@countrycityswing.dance")).toBe(
      `"Isaiah Britto" <confirmation@countrycityswing.dance>`
    );
  });
});
