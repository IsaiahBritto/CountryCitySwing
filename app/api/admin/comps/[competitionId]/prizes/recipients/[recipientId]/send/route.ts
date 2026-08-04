import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  PrizeAwardsError,
  loadRecipientForSend,
  markRecipientEmailSent,
} from "@/lib/comps/prizeAwards";
import {
  buildCompPrizeEmailSubject,
  createCompPrizeEmailHtml,
  createCompPrizeEmailText,
} from "@/lib/email/compPrizeEmail";
import { sendHtmlEmail } from "@/lib/mailer";

/** POST: send prize email to one recipient. */
export async function POST(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ competitionId: string; recipientId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId, recipientId } = await params;

  try {
    const ctx = await loadRecipientForSend(recipientId, competitionId);
    const emailArgs = {
      recipientFirstName: ctx.recipient.first_name,
      competitionName: ctx.competition.name,
      compType: ctx.competition.comp_type,
      placement: ctx.placement,
      prizes: ctx.items.map((item) => ({
        description: item.description,
        redemptionCode: item.redemption_code,
      })),
    };

    if (!ctx.recipient.email?.trim()) {
      throw new PrizeAwardsError("Recipient has no email address", 409);
    }

    await sendHtmlEmail(
      ctx.recipient.email.trim(),
      buildCompPrizeEmailSubject(emailArgs),
      createCompPrizeEmailHtml(emailArgs),
      undefined,
      createCompPrizeEmailText(emailArgs)
    );

    await markRecipientEmailSent(recipientId);

    return NextResponse.json({ success: true, email: ctx.recipient.email });
  } catch (err) {
    if (err instanceof PrizeAwardsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/comps/prizes/send] POST failed", err);
    return NextResponse.json({ error: "Failed to send prize email" }, { status: 500 });
  }
}
