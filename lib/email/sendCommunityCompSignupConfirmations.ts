import { sendHtmlEmail } from "@/lib/mailer";
import { normalizeCompSignupEmail } from "@/lib/communityCompSignupGuest";
import type { GuestResolvedCompSignupFields } from "@/lib/communityCompSignupGuest";
import {
  buildCommunityCompSignupConfirmationHtml,
  type CommunityCompEventDetails,
  type CommunityCompSignupSummary,
} from "@/lib/email/communityCompSignupConfirmationEmail";

export async function sendCommunityCompSignupConfirmations(args: {
  event: CommunityCompEventDetails;
  summary: CommunityCompSignupSummary;
  resolved: GuestResolvedCompSignupFields;
  strictlySelected: boolean;
}): Promise<void> {
  const subjectBase = args.event.title;
  const registrantHtml = buildCommunityCompSignupConfirmationHtml({
    audience: "registrant",
    event: args.event,
    summary: args.summary,
  });

  try {
    await sendHtmlEmail(
      args.summary.registrantEmail,
      `Comp signup — ${subjectBase}`,
      registrantHtml,
      "confirmation@countrycityswing.dance"
    );
  } catch (err) {
    console.error("[non-ccs-comp-signup] registrant email error:", err);
  }

  if (!args.strictlySelected) return;

  const partnerEmail =
    args.summary.registrantEmail ===
    normalizeCompSignupEmail(args.resolved.strictly_lead_email)
      ? normalizeCompSignupEmail(args.resolved.strictly_follow_email)
      : normalizeCompSignupEmail(args.resolved.strictly_lead_email);

  if (!partnerEmail || partnerEmail === args.summary.registrantEmail) return;

  const partnerHtml = buildCommunityCompSignupConfirmationHtml({
    audience: "strictly_partner",
    event: args.event,
    summary: args.summary,
  });

  try {
    await sendHtmlEmail(
      partnerEmail,
      `Strictly partner — ${subjectBase}`,
      partnerHtml,
      "confirmation@countrycityswing.dance"
    );
  } catch (err) {
    console.error("[non-ccs-comp-signup] partner email error:", err);
  }
}
