import {
  DEFAULT_TIME_ZONE,
  formatEventDate,
  formatEventTime,
  getTimeZoneAbbreviation,
} from "@/lib/utils/dateHelpers";
import type { GuestResolvedCompSignupFields } from "@/lib/communityCompSignupGuest";
import { normalizeCompSignupEmail } from "@/lib/communityCompSignupGuest";

export type CommunityCompEventDetails = {
  title: string;
  starts_at?: string | null;
  location?: string | null;
  time_zone?: string | null;
};

export type CommunityCompSignupSummary = {
  registrantFirstName: string;
  registrantLastName: string;
  registrantEmail: string;
  strictlySelected: boolean;
  strictlyRole?: "lead" | "follow" | null;
  jnjSelected: boolean;
  jnjRole?: "lead" | "follow" | null;
  strictlyPartnerFirstName?: string | null;
  strictlyPartnerLastName?: string | null;
  amountOwed: number;
  paymentMethodLabel: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRole(role: "lead" | "follow" | null | undefined): string {
  if (role === "lead") return "Lead";
  if (role === "follow") return "Follow";
  return "—";
}

function buildDivisionLines(
  summary: CommunityCompSignupSummary,
  audience: "registrant" | "strictly_partner"
): string[] {
  const lines: string[] = [];
  if (summary.strictlySelected) {
    const role =
      audience === "strictly_partner"
        ? summary.strictlyRole === "lead"
          ? "follow"
          : summary.strictlyRole === "follow"
            ? "lead"
            : summary.strictlyRole
        : summary.strictlyRole;
    lines.push(
      `<div class="detail-row"><strong>Strictly:</strong> ${escapeHtml(formatRole(role))}</div>`
    );
  }
  if (audience === "registrant" && summary.jnjSelected) {
    lines.push(
      `<div class="detail-row"><strong>Jack &amp; Jill:</strong> ${escapeHtml(formatRole(summary.jnjRole))}</div>`
    );
  }
  return lines;
}

export function buildCommunityCompSignupConfirmationHtml(args: {
  audience: "registrant" | "strictly_partner";
  event: CommunityCompEventDetails;
  summary: CommunityCompSignupSummary;
}): string {
  const { audience, event, summary } = args;
  const tz = event.time_zone || DEFAULT_TIME_ZONE;
  const eventTitle = escapeHtml(event.title);
  const dateLine =
    event.starts_at && formatEventDate(event.starts_at, tz)
      ? escapeHtml(formatEventDate(event.starts_at, tz))
      : "";
  const timeLine =
    event.starts_at && formatEventTime(event.starts_at, tz)
      ? `${escapeHtml(formatEventTime(event.starts_at, tz))} ${escapeHtml(getTimeZoneAbbreviation(event.starts_at, tz))}`
      : "";
  const locationLine = event.location?.trim()
    ? escapeHtml(event.location.trim())
    : "";

  const recipientName =
    audience === "registrant"
      ? escapeHtml(`${summary.registrantFirstName} ${summary.registrantLastName}`.trim())
      : escapeHtml(
          `${summary.strictlyPartnerFirstName ?? ""} ${summary.strictlyPartnerLastName ?? ""}`.trim() ||
            "there"
        );

  const intro =
    audience === "registrant"
      ? "Your comp registration has been received for the event below."
      : "You are listed as a Strictly partner for the registration below.";

  const divisionBlock = buildDivisionLines(summary, audience).join("\n");

  const partnerRow =
    audience === "registrant" && summary.strictlySelected
      ? `<div class="detail-row"><strong>Strictly partner:</strong> ${escapeHtml(
          `${summary.strictlyPartnerFirstName ?? ""} ${summary.strictlyPartnerLastName ?? ""}`.trim()
        )}</div>`
      : audience === "strictly_partner"
        ? `<div class="detail-row"><strong>Registered by:</strong> ${escapeHtml(
            `${summary.registrantFirstName} ${summary.registrantLastName}`.trim()
          )}</div>`
        : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
      .content { background-color: #f9f9f9; padding: 20px; }
      .details-box { background-color: white; border: 2px solid #f2c94c; border-radius: 8px; padding: 20px; margin: 20px 0; }
      .detail-row { padding: 10px 0; border-bottom: 1px solid #eee; }
      .detail-row:last-child { border-bottom: none; }
      .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Country City Swing</h1>
        <h2>Comp Registration Confirmation</h2>
      </div>
      <div class="content">
        <p>Hi ${recipientName},</p>
        <p>${intro}</p>
        <div class="details-box">
          <h3 style="margin-top: 0; color: #f2c94c;">${eventTitle}</h3>
          ${dateLine ? `<div class="detail-row"><strong>Date:</strong> ${dateLine}</div>` : ""}
          ${timeLine ? `<div class="detail-row"><strong>Time:</strong> ${timeLine}</div>` : ""}
          ${locationLine ? `<div class="detail-row"><strong>Location:</strong> ${locationLine}</div>` : ""}
          ${divisionBlock}
          ${partnerRow}
          <div class="detail-row"><strong>Amount due:</strong> $${summary.amountOwed.toFixed(2)}</div>
          <div class="detail-row"><strong>Payment method:</strong> ${escapeHtml(summary.paymentMethodLabel)}</div>
        </div>
        <div style="background-color: #fff3cd; border-left: 4px solid #f2c94c; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;">Pay the event organizer using the method you selected. This event is not billed through Country City Swing.</p>
        </div>
        <p>Questions? Contact us at contact.us@countrycityswing.dance</p>
      </div>
      <div class="footer">Country City Swing — Nashville, TN</div>
    </div>
  </body>
</html>`;
}

export function buildSignupSummaryFromGuestPayload(
  data: {
    registrant?: { first_name?: unknown; last_name?: unknown; email?: unknown };
    strictly_role?: unknown;
    jnj_role?: unknown;
  },
  resolved: GuestResolvedCompSignupFields,
  opts: {
    strictlySelected: boolean;
    jnjSelected: boolean;
    amountOwed: number;
    paymentMethodLabel: string;
  }
): CommunityCompSignupSummary | null {
  const registrantEmail = normalizeCompSignupEmail(data.registrant?.email);
  if (!registrantEmail) return null;
  const first =
    typeof data.registrant?.first_name === "string"
      ? data.registrant.first_name.trim()
      : "";
  const last =
    typeof data.registrant?.last_name === "string"
      ? data.registrant.last_name.trim()
      : "";

  const strictlyRole =
    data.strictly_role === "lead" || data.strictly_role === "follow"
      ? data.strictly_role
      : null;
  const jnjRole =
    data.jnj_role === "lead" || data.jnj_role === "follow" ? data.jnj_role : null;

  let partnerFirst: string | null = null;
  let partnerLast: string | null = null;
  if (opts.strictlySelected && strictlyRole) {
    if (strictlyRole === "lead") {
      partnerFirst = resolved.strictly_follow_first_name;
      partnerLast = resolved.strictly_follow_last_name;
    } else {
      partnerFirst = resolved.strictly_lead_first_name;
      partnerLast = resolved.strictly_lead_last_name;
    }
  }

  return {
    registrantFirstName: first,
    registrantLastName: last,
    registrantEmail,
    strictlySelected: opts.strictlySelected,
    strictlyRole,
    jnjSelected: opts.jnjSelected,
    jnjRole,
    strictlyPartnerFirstName: partnerFirst,
    strictlyPartnerLastName: partnerLast,
    amountOwed: opts.amountOwed,
    paymentMethodLabel: opts.paymentMethodLabel,
  };
}
