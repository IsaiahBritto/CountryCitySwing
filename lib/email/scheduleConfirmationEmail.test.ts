import { describe, expect, it } from "vitest";
import { createScheduleConfirmationEmailHtml } from "@/lib/email/scheduleConfirmationEmail";

describe("createScheduleConfirmationEmailHtml", () => {
  it("renders readable explicit text colors and key details", () => {
    const html = createScheduleConfirmationEmailHtml({
      kind: "signup",
      recipientName: "Brit & Co",
      eventTitle: "Instructor Night",
      position: "DJ",
      eventDate: "Fri, Apr 17",
      eventTime: "8:00 PM",
      eventLocation: "Main Hall",
    });

    expect(html).toContain("Schedule Signup Confirmation");
    expect(html).toContain("color:#F3F4F6");
    expect(html).toContain("background-color:#111827");
    expect(html).toContain("Location:</strong> Main Hall");
    expect(html).toContain("Brit &amp; Co");
    expect(html).toContain("/#events");
    expect(html).toContain("View upcoming events");
  });

  it("renders cancellation variant content", () => {
    const html = createScheduleConfirmationEmailHtml({
      kind: "cancel",
      recipientName: "Taylor",
      eventTitle: "Friday Social",
      position: "Host",
      eventDate: "Fri, Apr 24",
    });

    expect(html).toContain("Schedule Cancellation Confirmation");
    expect(html).toContain("Your schedule slot has been removed:");
    expect(html).toContain("You can sign up for other slots on the Schedule page.");
    expect(html).toContain("/#events");
    expect(html).toContain("View upcoming events");
  });
});
