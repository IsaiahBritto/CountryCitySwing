import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  PrizeAwardsError,
  listSendableRecipients,
  loadRecipientForSend,
  markRecipientEmailSent,
} from "@/lib/comps/prizeAwards";
import {
  buildCompPrizeEmailSubject,
  createCompPrizeEmailHtml,
  createCompPrizeEmailText,
} from "@/lib/email/compPrizeEmail";
import { sendHtmlEmail } from "@/lib/mailer";

/** POST: send prize emails to all eligible recipients. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  try {
    const { payload, sendableRecipientIds } =
      await listSendableRecipients(competitionId);

    const sent: { recipientId: string; email: string }[] = [];
    const failed: { recipientId: string; error: string }[] = [];
    const skipped: { recipientId: string; reason: string }[] = [];

    const allRecipientIds = payload.groups.flatMap((g) =>
      g.recipients.map((r) => r.id)
    );
    for (const id of allRecipientIds) {
      if (!sendableRecipientIds.includes(id)) {
        const recipient = payload.groups
          .flatMap((g) => g.recipients)
          .find((r) => r.id === id);
        skipped.push({
          recipientId: id,
          reason: recipient?.sendStatus ?? "not_ready",
        });
      }
    }

    for (const recipientId of sendableRecipientIds) {
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
          failed.push({ recipientId, error: "No email address" });
          continue;
        }

        await sendHtmlEmail(
          ctx.recipient.email.trim(),
          buildCompPrizeEmailSubject(emailArgs),
          createCompPrizeEmailHtml(emailArgs),
          undefined,
          createCompPrizeEmailText(emailArgs)
        );
        await markRecipientEmailSent(recipientId);
        sent.push({ recipientId, email: ctx.recipient.email.trim() });
      } catch (err) {
        failed.push({
          recipientId,
          error:
            err instanceof PrizeAwardsError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Send failed",
        });
      }
    }

    const refreshed = await listSendableRecipients(competitionId);

    return NextResponse.json({
      sent,
      skipped,
      failed,
      payload: refreshed.payload,
    });
  } catch (err) {
    if (err instanceof PrizeAwardsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/comps/prizes/send-all] POST failed", err);
    return NextResponse.json(
      { error: "Failed to send prize emails" },
      { status: 500 }
    );
  }
}
