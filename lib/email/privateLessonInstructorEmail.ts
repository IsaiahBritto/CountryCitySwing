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

function renderDetailRows(rows: Array<[string, string]>): string {
  return rows
    .map(([label, value], i) => detailRow(label, value, i === rows.length - 1))
    .join("\n                      ");
}

export type PrivateLessonInstructorBookingEmailArgs = {
  instructorFirstName: string;
  studentName: string;
  studentEmail: string;
  studentPhone?: string | null;
  lessonDateFormatted: string;
  lessonTime: string;
  lessonDuration: number | string;
  lessonFocus?: string | null;
  lessonPrice?: number | null;
  lessonLocation?: string | null;
};

export type PrivateLessonInstructorCancelEmailArgs = {
  instructorFirstName: string;
  studentName: string;
  studentEmail?: string | null;
  lessonDateFormatted: string;
  lessonTime: string;
};

function wrapInstructorEmail(title: string, greetingName: string, intro: string, rowHtml: string, outro: string): string {
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
                <p style="margin:0 0 12px 0;">Hi ${greetingName},</p>
                <p style="margin:0;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 8px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111827;border-radius:6px;">
                  <tr>
                    <td style="padding:18px;font-family:Arial,Helvetica,sans-serif;">
                      ${rowHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
                <p style="margin:0;">${outro}</p>
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

export function createPrivateLessonInstructorBookingEmailHtml({
  instructorFirstName,
  studentName,
  studentEmail,
  studentPhone,
  lessonDateFormatted,
  lessonTime,
  lessonDuration,
  lessonFocus,
  lessonPrice,
  lessonLocation,
}: PrivateLessonInstructorBookingEmailArgs): string {
  const safeFirst = escapeHtml(instructorFirstName?.trim() || "Instructor");
  const rows: Array<[string, string]> = [
    ["Student", escapeHtml(studentName)],
    ["Email", escapeHtml(studentEmail)],
  ];
  if (studentPhone?.trim()) rows.push(["Phone", escapeHtml(studentPhone.trim())]);
  rows.push(["Date", escapeHtml(lessonDateFormatted)]);
  rows.push(["Time", escapeHtml(lessonTime)]);
  rows.push(["Duration", `${escapeHtml(String(lessonDuration))} minutes`]);
  if (lessonPrice != null && !Number.isNaN(Number(lessonPrice))) {
    rows.push(["Price", `$${Number(lessonPrice).toFixed(2)}`]);
  }
  if (lessonFocus?.trim()) rows.push(["Focus", escapeHtml(lessonFocus.trim())]);
  if (lessonLocation?.trim()) {
    rows.push(["Location", escapeHtml(lessonLocation.trim())]);
  }

  return wrapInstructorEmail(
    "New Private Lesson Booking",
    safeFirst,
    "You have a new private lesson booking!",
    renderDetailRows(rows),
    "The student has been sent a confirmation email. You can view and manage this booking in your instructor dashboard."
  );
}

export function createPrivateLessonInstructorCancelEmailHtml({
  instructorFirstName,
  studentName,
  studentEmail,
  lessonDateFormatted,
  lessonTime,
}: PrivateLessonInstructorCancelEmailArgs): string {
  const safeFirst = escapeHtml(instructorFirstName?.trim() || "Instructor");
  const rows: Array<[string, string]> = [["Student", escapeHtml(studentName)]];
  if (studentEmail?.trim()) rows.push(["Email", escapeHtml(studentEmail.trim())]);
  rows.push(["Date", escapeHtml(lessonDateFormatted)]);
  rows.push(["Time", escapeHtml(lessonTime)]);

  return wrapInstructorEmail(
    "Lesson Booking Cancelled",
    safeFirst,
    "A private lesson booking has been cancelled.",
    renderDetailRows(rows),
    "The slot is now available for booking again. You can view and manage your slots in your instructor dashboard."
  );
}
