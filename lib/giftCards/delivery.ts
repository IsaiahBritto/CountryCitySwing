import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";
import {
  createGiftCardBuyerEmailHtml,
  createGiftCardRecipientEmailHtml,
} from "@/lib/email/giftCardEmails";
import { formatDeliverAtForEmail } from "@/lib/giftCards/schedule";

type GiftCardEmailRow = {
  id: string;
  code: string | null;
  initial_amount: number;
  purchased_for_self: boolean;
  buyer_email: string;
  buyer_name: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  personal_message: string | null;
  deliver_at: string | null;
  deliver_timezone: string | null;
  recipient_email_status: string;
};

export async function sendGiftCardBuyerConfirmation(
  card: GiftCardEmailRow,
  options?: { includeCode?: boolean }
): Promise<void> {
  const includeCode =
    options?.includeCode ??
  (card.purchased_for_self || card.buyer_email === card.recipient_email);

  const html = createGiftCardBuyerEmailHtml({
    amount: Number(card.initial_amount) || 0,
    recipientName: card.recipient_name,
    recipientEmail: card.recipient_email,
    purchasedForSelf: card.purchased_for_self,
    deliverAtLabel: card.deliver_at
      ? formatDeliverAtForEmail(card.deliver_at, card.deliver_timezone)
      : null,
    code: includeCode ? card.code : null,
  });

  await sendHtmlEmail(
    card.buyer_email,
    includeCode
      ? "Your Country City Swing gift card"
      : "Gift card purchase confirmed",
    html
  );
}

export async function sendGiftCardRecipientEmail(
  card: GiftCardEmailRow
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = card.recipient_email?.trim();
  if (!to || !card.code) {
    return { ok: false, error: "Missing recipient or code" };
  }

  const html = createGiftCardRecipientEmailHtml({
    amount: Number(card.initial_amount) || 0,
    code: card.code,
    personalMessage: card.personal_message,
    recipientName: card.recipient_name,
    buyerName: card.buyer_name,
  });

  try {
    await sendHtmlEmail(to, "You received a Country City Swing gift card", html);
  } catch (e) {
    console.error("sendGiftCardRecipientEmail", e);
    await supabaseServer
      .from("gift_cards")
      .update({ recipient_email_status: "failed" })
      .eq("id", card.id);
    return { ok: false, error: "Send failed" };
  }

  await supabaseServer
    .from("gift_cards")
    .update({
      recipient_email_status: "sent",
      recipient_email_sent_at: new Date().toISOString(),
    })
    .eq("id", card.id);

  return { ok: true };
}

export async function maybeSendRecipientNow(cardId: string): Promise<void> {
  const { data: card } = await supabaseServer
    .from("gift_cards")
    .select(
      "id,code,initial_amount,purchased_for_self,buyer_email,buyer_name,recipient_email,recipient_name,personal_message,deliver_at,deliver_timezone,recipient_email_status,paid"
    )
    .eq("id", cardId)
    .single();

  if (!card?.paid || !card.code) return;
  if (card.recipient_email_status === "sent" || card.recipient_email_status === "skipped") {
    return;
  }

  const deliverAt = card.deliver_at ? new Date(card.deliver_at).getTime() : 0;
  const now = Date.now();
  if (deliverAt > now + 60_000) {
    return;
  }

  if (card.purchased_for_self && card.buyer_email === card.recipient_email) {
    await supabaseServer
      .from("gift_cards")
      .update({ recipient_email_status: "skipped" })
      .eq("id", cardId);
    return;
  }

  await sendGiftCardRecipientEmail(card as GiftCardEmailRow);
}

export async function deliverPendingGiftCardEmails(): Promise<{
  sent: number;
  failed: number;
}> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabaseServer
    .from("gift_cards")
    .select(
      "id,code,initial_amount,purchased_for_self,buyer_email,buyer_name,recipient_email,recipient_name,personal_message,deliver_at,deliver_timezone,recipient_email_status"
    )
    .eq("paid", true)
    .eq("status", "active")
    .eq("recipient_email_status", "pending")
    .not("code", "is", null)
    .not("recipient_email", "is", null)
    .lte("deliver_at", now);

  if (error || !rows?.length) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.purchased_for_self && row.buyer_email === row.recipient_email) {
      await supabaseServer
        .from("gift_cards")
        .update({ recipient_email_status: "skipped" })
        .eq("id", row.id);
      continue;
    }
    const result = await sendGiftCardRecipientEmail(row as GiftCardEmailRow);
    if (result.ok) sent++;
    else failed++;
  }
  return { sent, failed };
}