import {
  formatEventDateInChicago,
  formatEventTimeInChicago,
} from "@/lib/utils/dateHelpers";

export type NewsletterEventRow = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  description: string | null;
  signup_link: string | null;
  type: string | null;
};

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/`/g, "&#96;");
}

/**
 * Build the weekly newsletter HTML (workshop spotlight + this week's events).
 * Simple single-table layout so content renders reliably across email clients.
 */
export function buildNewsletterHtml(
  workshop: NewsletterEventRow | null,
  weekEvents: NewsletterEventRow[],
  unsubscribeUrl: string
): string {
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://countrycityswing.dance").replace(/\/$/, "");
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);

  const eventItems: string[] = [];
  for (const e of weekEvents) {
    const timePart = e.starts_at ? " &middot; " + formatEventTimeInChicago(e.starts_at) : "";
    const locPart = e.location ? " &middot; " + escapeHtml(e.location) : "";
    const signupHref = e.signup_link ? escapeHtml(e.signup_link) : siteUrl + "/events";
    const signupPart =
      '<table cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr><td bgcolor="#F2C94C" style="background-color:#F2C94C;border-radius:6px;padding:6px 14px;"><a href="' + signupHref + '" style="color:#0D0D0D;font-size:14px;text-decoration:none;font-weight:600;">Sign up</a></td></tr></table>';
    eventItems.push(
      '<div style="padding:12px 0;border-bottom:1px solid #2A2A2A;background-color:#0D0D0D;color:#E5E5E5;">' +
        "<strong style=\"color:#E5E5E5;\">" + escapeHtml(e.title) + "</strong><br>" +
        "<span style=\"color:#a3a3a3;font-size:14px;\">" + formatEventDateInChicago(e.starts_at) + timePart + locPart + "</span>" +
        signupPart +
        "</div>"
    );
  }
  const eventsSection =
    eventItems.length > 0 ? eventItems.join("") : "<div style=\"padding:12px 0;color:#a3a3a3;background-color:#0D0D0D;\">No events this week.</div>";

  let workshopSection = "";
  if (workshop) {
    const workshopSignupHref = workshop.signup_link ? escapeHtml(workshop.signup_link) : siteUrl + "/events";
    const descSnippet = workshop.description
      ? escapeHtml(workshop.description.slice(0, 200)) + (workshop.description.length > 200 ? "&#8230;" : "")
      : "";
    workshopSection =
      '<div style="margin-bottom:24px;border:1px solid #F2C94C;border-radius:12px;padding:20px;background-color:#0D0D0D;">' +
      '<p style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#F2C94C;">Workshop spotlight</p>' +
      "<h2 style=\"margin:0 0 8px 0;font-size:20px;color:#F2C94C;\">" + escapeHtml(workshop.title) + "</h2>" +
      "<p style=\"margin:0 0 4px 0;color:#a3a3a3;font-size:15px;\">" + formatEventDateInChicago(workshop.starts_at) + (workshop.starts_at ? " &middot; " + formatEventTimeInChicago(workshop.starts_at) : "") + "</p>" +
      (workshop.location ? "<p style=\"margin:0 0 12px 0;color:#a3a3a3;font-size:15px;\">&#128205; " + escapeHtml(workshop.location) + "</p>" : "") +
      (workshop.description ? "<p style=\"margin:0 0 16px 0;color:#d4d4d4;\">" + descSnippet + "</p>" : "") +
      '<table cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr><td bgcolor="#F2C94C" style="background-color:#F2C94C;border-radius:8px;padding:10px 20px;"><a href="' + workshopSignupHref + '" style="color:#0D0D0D;text-decoration:none;font-weight:600;">Sign up</a></td></tr></table>' +
      "</div>";
  }

  const html =
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>This week at Country City Swing</title><meta name=\"color-scheme\" content=\"dark\"><meta name=\"supported-color-schemes\" content=\"dark\"></head>" +
    "<body style=\"margin:0;padding:0;background-color:#0D0D0D;font-family:Inter,system-ui,sans-serif;color:#E5E5E5;line-height:1.6;\">" +
    "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"#0D0D0D\"><tr><td align=\"center\" style=\"padding:24px 16px;background-color:#0D0D0D;\" bgcolor=\"#0D0D0D\">" +
    "<div style=\"max-width:600px;text-align:left;background-color:#0D0D0D;\">" +
    "<div style=\"text-align:center;margin-bottom:24px;\">" +
    "<a href=\"" + siteUrl + "\" style=\"text-decoration:none;font-weight:700;font-size:20px;color:#F2C94C;\">Country City Swing</a>" +
    "<p style=\"color:#a3a3a3;font-size:14px;margin:8px 0 0 0;\">Nashville's Country Swing partner dancing</p>" +
    "</div>" +
    workshopSection +
    "<h3 style=\"margin:0 0 12px 0;font-size:18px;color:#F2C94C;\">This week's schedule</h3>" +
    eventsSection +
    "<div style=\"margin-top:24px;padding-top:24px;border-top:1px solid #2A2A2A;text-align:center;background-color:#0D0D0D;\">" +
    "<p style=\"color:#737373;font-size:14px;margin:0;\">See you on the dance floor.</p>" +
    "<p style=\"color:#737373;font-size:14px;margin:8px 0 0 0;\"><a href=\"" + siteUrl + "\" style=\"color:#F2C94C;text-decoration:none;\">countrycityswing.dance</a></p>" +
    "<p style=\"margin:16px 0 0 0;font-size:12px;color:#525252;\"><a href=\"" + safeUnsubscribe + "\" style=\"color:#737373;text-decoration:underline;\">Unsubscribe from weekly emails</a></p>" +
    "</div></div></td></tr></table></body></html>";
  return html;
}

/**
 * Plain-text version of the newsletter so clients that strip HTML still show content.
 */
export function buildNewsletterText(
  workshop: NewsletterEventRow | null,
  weekEvents: NewsletterEventRow[],
  unsubscribeUrl: string
): string {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://countrycityswing.dance";
  const lines: string[] = [
    "Country City Swing",
    "Nashville's Country Swing partner dancing",
    "",
  ];
  if (workshop) {
    lines.push("WORKSHOP SPOTLIGHT");
    lines.push(workshop.title);
    lines.push(formatEventDateInChicago(workshop.starts_at) + (workshop.starts_at ? " " + formatEventTimeInChicago(workshop.starts_at) : ""));
    if (workshop.location) lines.push(workshop.location);
    lines.push((workshop.signup_link || siteUrl + "/events") + "\n");
  }
  lines.push("THIS WEEK'S SCHEDULE");
  if (weekEvents.length > 0) {
    for (const e of weekEvents) {
      lines.push("- " + e.title + ": " + formatEventDateInChicago(e.starts_at) + (e.starts_at ? " " + formatEventTimeInChicago(e.starts_at) : "") + (e.location ? " @ " + e.location : ""));
      if (e.signup_link) lines.push("  Sign up: " + e.signup_link);
    }
  } else {
    lines.push("No events this week.");
  }
  lines.push("");
  lines.push("See you on the dance floor.");
  lines.push(siteUrl);
  lines.push("Unsubscribe: " + unsubscribeUrl);
  return lines.join("\n");
}
