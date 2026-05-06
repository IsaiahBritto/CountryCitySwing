type ScheduleConfirmationKind = "signup" | "cancel";

type ScheduleConfirmationEmailArgs = {
  kind: ScheduleConfirmationKind;
  recipientName?: string;
  eventTitle: string;
  position: string;
  eventDate: string;
  eventTime?: string;
  eventLocation?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createScheduleConfirmationEmailHtml({
  kind,
  recipientName,
  eventTitle,
  position,
  eventDate,
  eventTime,
  eventLocation,
}: ScheduleConfirmationEmailArgs): string {
  const safeRecipientName = escapeHtml(recipientName?.trim() || "there");
  const safeEventTitle = escapeHtml(eventTitle);
  const safePosition = escapeHtml(position);
  const safeEventDate = escapeHtml(eventDate);
  const safeEventTime = eventTime ? escapeHtml(eventTime) : "";
  const safeEventLocation = eventLocation ? escapeHtml(eventLocation) : "";

  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://countrycityswing.dance").replace(/\/$/, "");
  const eventsListingHref = escapeHtml(`${siteUrl}/#events`);

  const title =
    kind === "signup"
      ? "Schedule Signup Confirmation"
      : "Schedule Cancellation Confirmation";
  const intro =
    kind === "signup"
      ? "You're signed up for the following schedule slot:"
      : "Your schedule slot has been removed:";
  const outro =
    kind === "signup"
      ? "You can view or change your schedule at any time on the Schedule page."
      : "You can sign up for other slots on the Schedule page.";

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background-color:#ffffff;border:1px solid #e7e7e7;border-radius:8px;">
            <tr>
              <td style="padding:24px 24px 12px 24px;font-family:Arial,Helvetica,sans-serif;">
                <h2 style="margin:0;color:#B8860B;font-size:28px;line-height:1.3;font-weight:700;">${title}</h2>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
                <p style="margin:0 0 12px 0;">Hi ${safeRecipientName},</p>
                <p style="margin:0;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 8px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111827;border-radius:6px;">
                  <tr>
                    <td style="padding:18px 18px 10px 18px;font-family:Arial,Helvetica,sans-serif;">
                      <p style="margin:0 0 10px 0;color:#F3F4F6;font-size:16px;line-height:1.5;"><strong style="color:#F2C94C;">Event:</strong> ${safeEventTitle}</p>
                      <p style="margin:0 0 10px 0;color:#F3F4F6;font-size:16px;line-height:1.5;"><strong style="color:#F2C94C;">Position:</strong> ${safePosition}</p>
                      <p style="margin:0 0 10px 0;color:#F3F4F6;font-size:16px;line-height:1.5;"><strong style="color:#F2C94C;">Date:</strong> ${safeEventDate}</p>
                      ${
                        safeEventTime
                          ? `<p style="margin:0 0 10px 0;color:#F3F4F6;font-size:16px;line-height:1.5;"><strong style="color:#F2C94C;">Time:</strong> ${safeEventTime}</p>`
                          : ""
                      }
                      ${
                        safeEventLocation
                          ? `<p style="margin:0;color:#F3F4F6;font-size:16px;line-height:1.5;"><strong style="color:#F2C94C;">Location:</strong> ${safeEventLocation}</p>`
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
                <p style="margin:0;">${outro}</p>
                <p style="margin:12px 0 0 0;">
                  <a href="${eventsListingHref}" style="color:#B8860B;font-weight:600;text-decoration:underline;">View upcoming events</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;color:#6b7280;font-size:14px;line-height:1.6;">
                <p style="margin:0;">&mdash; The Country City Swing Team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
