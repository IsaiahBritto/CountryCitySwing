export type PrivateLessonStudentEmailKind = "booking" | "update";

export type PrivateLessonStudentEmailArgs = {
  kind: PrivateLessonStudentEmailKind;
  recipientFirstName: string;
  instructorName: string;
  instructorEmail: string;
  lessonDateFormatted: string;
  lessonTime: string;
  lessonDuration: number | string;
  lessonFocus?: string | null;
  lessonPrice?: number | null;
  lessonLocation?: string | null;
  disclaimer?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function detailRow(label: string, value: string, isLast = false): string {
  const margin = isLast ? "0" : "0 0 10px 0";
  return `<p style="margin:${margin};color:#F3F4F6;font-size:16px;line-height:1.5;"><strong style="color:#F2C94C;">${label}:</strong> ${value}</p>`;
}

export function buildPrivateLessonStudentSubject(
  kind: PrivateLessonStudentEmailKind,
  instructorName: string,
  lessonLocation?: string | null
): string {
  const title =
    kind === "booking"
      ? "Private Lesson Booking Confirmation"
      : "Private Lesson Updated";
  const location = lessonLocation?.trim();
  return `${title} - ${instructorName}${location ? ` ${location}` : ""}`;
}

export function createPrivateLessonStudentEmailHtml({
  kind,
  recipientFirstName,
  instructorName,
  instructorEmail,
  lessonDateFormatted,
  lessonTime,
  lessonDuration,
  lessonFocus,
  lessonPrice,
  lessonLocation,
  disclaimer,
}: PrivateLessonStudentEmailArgs): string {
  const safeFirstName = escapeHtml(recipientFirstName?.trim() || "there");
  const safeInstructorName = escapeHtml(instructorName);
  const safeInstructorEmail = escapeHtml(instructorEmail);
  const safeDate = escapeHtml(lessonDateFormatted);
  const safeTime = escapeHtml(lessonTime);
  const safeDuration = escapeHtml(String(lessonDuration));
  const safeFocus = lessonFocus?.trim() ? escapeHtml(lessonFocus.trim()) : "";
  const safeLocation = lessonLocation?.trim()
    ? escapeHtml(lessonLocation.trim())
    : "";
  const safeDisclaimer = disclaimer?.trim()
    ? escapeHtml(disclaimer.trim()).replace(/\n/g, "<br>")
    : "";
  const mailtoHref = escapeHtml(`mailto:${instructorEmail}`);

  const title =
    kind === "booking"
      ? "Private Lesson Booking Confirmation"
      : "Private Lesson Updated";
  const detailsHeading =
    kind === "booking" ? "Lesson Details" : "Updated Lesson Details";

  const introBlock =
    kind === "booking"
      ? `<p style="margin:0;">Your private lesson has been confirmed!</p>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff8e1;border-left:4px solid #F2C94C;border-radius:4px;margin:0 0 16px 0;">
          <tr>
            <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:16px;line-height:1.5;">
              <p style="margin:0;"><strong>Lesson Details Updated</strong></p>
              <p style="margin:6px 0 0 0;">Your private lesson details have been updated by your instructor. Please make note of the updated information below.</p>
            </td>
          </tr>
        </table>`;

  const outro =
    kind === "booking"
      ? "We're excited for your lesson! If you need to cancel or reschedule, please contact your instructor as soon as possible."
      : "If you have any questions or need to reschedule, please contact your instructor as soon as possible.";

  const hasPrice = lessonPrice != null && !Number.isNaN(Number(lessonPrice));
  const hasFocus = Boolean(safeFocus);
  const hasLocation = Boolean(safeLocation);

  const rows: string[] = [
    detailRow("Instructor", safeInstructorName),
    detailRow("Date", safeDate),
    detailRow("Time", safeTime),
    detailRow("Duration", `${safeDuration} minutes`, !hasPrice && !hasFocus && !hasLocation),
  ];
  if (hasPrice) {
    rows.push(
      detailRow(
        "Price",
        `$${Number(lessonPrice).toFixed(2)}`,
        !hasFocus && !hasLocation
      )
    );
  }
  if (hasFocus) {
    rows.push(detailRow("Focus", safeFocus, !hasLocation));
  }
  if (hasLocation) {
    rows.push(detailRow("Location", safeLocation, true));
  }

  const disclaimerBlock = safeDisclaimer
    ? `<tr>
        <td style="padding:8px 24px 0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
            <tr>
              <td style="padding:16px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 8px 0;font-weight:700;color:#1f2937;">Disclaimer</p>
                <p style="margin:0;color:#4b5563;">${safeDisclaimer}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background-color:#ffffff;border:1px solid #e7e7e7;border-radius:8px;">
            <tr>
              <td style="padding:24px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;text-align:center;background-color:#F2C94C;">
                <h1 style="margin:0 0 6px 0;color:#111827;font-size:26px;line-height:1.3;font-weight:700;">${safeInstructorName}</h1>
                <h2 style="margin:0;color:#111827;font-size:18px;line-height:1.3;font-weight:600;">${title}</h2>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
                <p style="margin:0 0 12px 0;">Hi ${safeFirstName},</p>
                ${introBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 8px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111827;border-radius:6px;">
                  <tr>
                    <td style="padding:18px;font-family:Arial,Helvetica,sans-serif;">
                      <p style="margin:0 0 12px 0;color:#F2C94C;font-size:16px;line-height:1.4;font-weight:700;">${detailsHeading}</p>
                      ${rows.join("\n                      ")}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${disclaimerBlock}
            <tr>
              <td style="padding:16px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
                <p style="margin:0;">${outro}</p>
                <p style="margin:16px 0 0 0;font-size:15px;color:#4b5563;">
                  If you have any questions, please contact your instructor at
                  <a href="${mailtoHref}" style="color:#B8860B;font-weight:600;text-decoration:underline;">${safeInstructorEmail}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#6b7280;font-size:13px;line-height:1.6;text-align:center;">
                <p style="margin:0;">Private Lesson Signups Powered by Country City Swing</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
