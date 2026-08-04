import { ordinalPlacementLabel } from "@/lib/comps/finalsPlacements";

export type CompPrizeEmailArgs = {
  recipientFirstName: string;
  competitionName: string;
  compType: "jack_and_jill" | "strictly" | string;
  placement: number;
  prizes: { description: string; redemptionCode?: string | null }[];
};

const COMP_TYPE_LABEL: Record<string, string> = {
  jack_and_jill: "Jack & Jill",
  strictly: "Strictly",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCompPrizeEmailSubject(args: CompPrizeEmailArgs): string {
  const typeLabel = COMP_TYPE_LABEL[args.compType] ?? args.compType;
  return `Congratulations — ${ordinalPlacementLabel(args.placement)} place, ${args.competitionName} (${typeLabel})`;
}

export function createCompPrizeEmailHtml(args: CompPrizeEmailArgs): string {
  const safeFirstName = escapeHtml(args.recipientFirstName.trim() || "there");
  const safeCompName = escapeHtml(args.competitionName);
  const typeLabel = escapeHtml(
    COMP_TYPE_LABEL[args.compType] ?? args.compType
  );
  const placementLabel = escapeHtml(ordinalPlacementLabel(args.placement));

  const prizeRows = args.prizes
    .filter((p) => p.description.trim())
    .map((prize, index, list) => {
      const safeDescription = escapeHtml(prize.description.trim());
      const code = prize.redemptionCode?.trim();
      const codeLine = code
        ? `<br/><span style="color:#D1D5DB;font-size:14px;">Redemption code: <strong style="color:#F2C94C;">${escapeHtml(code)}</strong></span>`
        : "";
      const margin = index === list.length - 1 ? "0" : "0 0 14px 0";
      return `<li style="margin:${margin};color:#F3F4F6;font-size:16px;line-height:1.5;">${safeDescription}${codeLine}</li>`;
    })
    .join("");

  const prizeListBlock =
    prizeRows.length > 0
      ? `<ul style="margin:0;padding:0 0 0 20px;list-style:disc;">${prizeRows}</ul>`
      : `<p style="margin:0;color:#F3F4F6;font-size:16px;line-height:1.5;">Your prize details will be shared with you soon.</p>`;

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background-color:#ffffff;border:1px solid #e7e7e7;border-radius:8px;">
            <tr>
              <td style="padding:24px 24px 12px 24px;font-family:Arial,Helvetica,sans-serif;text-align:center;background-color:#F2C94C;">
                <h1 style="margin:0;color:#111827;font-size:26px;line-height:1.3;font-weight:700;">Congratulations!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
                <p style="margin:0 0 12px 0;">Hi ${safeFirstName},</p>
                <p style="margin:0;">Congratulations on your result in <strong>${safeCompName}</strong> (${typeLabel})!</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 8px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111827;border-radius:6px;">
                  <tr>
                    <td style="padding:18px;font-family:Arial,Helvetica,sans-serif;">
                      <p style="margin:0 0 10px 0;color:#F3F4F6;font-size:16px;line-height:1.5;"><strong style="color:#F2C94C;">Placement:</strong> ${placementLabel}</p>
                      <p style="margin:0 0 14px 0;color:#F3F4F6;font-size:16px;line-height:1.5;"><strong style="color:#F2C94C;">Competition:</strong> ${safeCompName}</p>
                      <p style="margin:0 0 10px 0;color:#F2C94C;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Your prizes</p>
                      ${prizeListBlock}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;color:#4b5563;font-size:15px;line-height:1.6;">
                <p style="margin:0;">Thank you for competing with Country City Swing. We hope to see you on the floor again soon!</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function createCompPrizeEmailText(args: CompPrizeEmailArgs): string {
  const typeLabel = COMP_TYPE_LABEL[args.compType] ?? args.compType;
  const lines = [
    `Hi ${args.recipientFirstName.trim() || "there"},`,
    "",
    `Congratulations on your result in ${args.competitionName} (${typeLabel})!`,
    `Placement: ${ordinalPlacementLabel(args.placement)}`,
    "",
    "Your prizes:",
  ];

  for (const prize of args.prizes.filter((p) => p.description.trim())) {
    lines.push(`- ${prize.description.trim()}`);
    if (prize.redemptionCode?.trim()) {
      lines.push(`  Redemption code: ${prize.redemptionCode.trim()}`);
    }
  }

  lines.push("", "Thank you for competing with Country City Swing!");
  return lines.join("\n");
}
