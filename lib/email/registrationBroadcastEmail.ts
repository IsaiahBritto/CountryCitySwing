import { escapeHtml } from "@/lib/newsletterEmail";
import {
  DEFAULT_TIME_ZONE,
  formatEventDate,
  formatEventTime,
} from "@/lib/utils/dateHelpers";

export type RegistrationBroadcastEvent = {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  time_zone?: string | null;
};

function bodyHtmlFromPlainText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return escapeHtml(trimmed)
    .split(/\n\n+/)
    .map((paragraph) =>
      `<p style="margin:0 0 16px 0;color:#E5E5E5;font-size:16px;line-height:1.6;">${paragraph
        .split(/\n/)
        .join("<br>")}</p>`
    )
    .join("");
}

export function buildRegistrationBroadcastHtml(input: {
  event: RegistrationBroadcastEvent;
  bodyText: string;
  recipientFirstName?: string;
}): string {
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://countrycityswing.dance").replace(
    /\/$/,
    ""
  );
  const tz = input.event.time_zone || DEFAULT_TIME_ZONE;
  const dateLabel = formatEventDate(input.event.starts_at, tz, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = formatEventTime(input.event.starts_at, tz);
  const greetingName = input.recipientFirstName?.trim()
    ? escapeHtml(input.recipientFirstName.trim())
    : "there";
  const bodySection = bodyHtmlFromPlainText(input.bodyText);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:Inter,system-ui,sans-serif;color:#E5E5E5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0D0D0D"><tr><td align="center" style="padding:24px 16px;">
<div style="max-width:600px;text-align:left;">
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${siteUrl}" style="text-decoration:none;font-weight:700;font-size:20px;color:#F2C94C;">Country City Swing</a>
    <p style="color:#a3a3a3;font-size:14px;margin:8px 0 0 0;">Nashville&apos;s Country Swing partner dancing</p>
  </div>
  <div style="border:1px solid #F2C94C;border-radius:12px;padding:20px;background-color:#141414;margin-bottom:20px;">
    <p style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#F2C94C;">Event update</p>
    <h1 style="margin:0 0 8px 0;font-size:22px;color:#F2C94C;">${escapeHtml(input.event.title)}</h1>
    <p style="margin:0 0 4px 0;color:#a3a3a3;font-size:15px;">${escapeHtml(dateLabel)} &middot; ${escapeHtml(timeLabel)}</p>
    ${
      input.event.location
        ? `<p style="margin:0;color:#a3a3a3;font-size:15px;">&#128205; ${escapeHtml(input.event.location)}</p>`
        : ""
    }
  </div>
  <div style="background-color:#141414;border-radius:12px;padding:20px;border:1px solid #2A2A2A;">
    <p style="margin:0 0 16px 0;color:#E5E5E5;font-size:16px;line-height:1.6;">Hi ${greetingName},</p>
    ${bodySection}
    <p style="margin:0;color:#a3a3a3;font-size:14px;line-height:1.6;">Questions? Reply to this email or contact us at contact.us@countrycityswing.dance</p>
  </div>
  <p style="margin:24px 0 0 0;text-align:center;color:#666;font-size:13px;">Country City Swing &middot; Nashville, TN</p>
</div>
</td></tr></table>
</body></html>`;
}

export function buildRegistrationBroadcastText(input: {
  event: RegistrationBroadcastEvent;
  bodyText: string;
  recipientFirstName?: string;
}): string {
  const tz = input.event.time_zone || DEFAULT_TIME_ZONE;
  const greetingName = input.recipientFirstName?.trim() || "there";
  const lines = [
    `Hi ${greetingName},`,
    "",
    input.bodyText.trim(),
    "",
    `${input.event.title}`,
    `${formatEventDate(input.event.starts_at, tz)} ${formatEventTime(input.event.starts_at, tz)}`,
  ];
  if (input.event.location) lines.push(input.event.location);
  lines.push("", "— Country City Swing", "contact.us@countrycityswing.dance");
  return lines.join("\n");
}
