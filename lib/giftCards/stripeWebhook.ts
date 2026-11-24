import type Stripe from "stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import { issueGiftCardAfterPayment } from "@/lib/giftCards/issue";
import {
  maybeSendRecipientNow,
  sendGiftCardBuyerConfirmation,
} from "@/lib/giftCards/delivery";
import { stripePaymentIntentIdFromSession } from "@/lib/giftCards/stripeSession";

export async function handleGiftCardPurchaseWebhook(
  session: Stripe.Checkout.Session
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const giftCardId = session.metadata?.gift_card_id;
  if (!giftCardId) {
    return { ok: false, status: 400, error: "Missing gift_card_id" };
  }

  const { data: existing } = await supabaseServer
    .from("gift_cards")
    .select("id,paid,code")
    .eq("id", giftCardId)
    .single();

  if (existing?.paid && existing.code) {
    return { ok: true };
  }

  const issued = await issueGiftCardAfterPayment({
    giftCardId,
    stripeSessionId: session.id,
    stripePaymentIntentId: stripePaymentIntentIdFromSession(session),
  });

  if (!issued.ok) {
    return { ok: false, status: 500, error: issued.error };
  }

  const { data: card } = await supabaseServer
    .from("gift_cards")
    .select(
      "id,code,initial_amount,purchased_for_self,buyer_email,buyer_name,recipient_email,recipient_name,personal_message,deliver_at,deliver_timezone,recipient_email_status"
    )
    .eq("id", giftCardId)
    .single();

  if (card) {
    try {
      await sendGiftCardBuyerConfirmation(card, {
        includeCode: card.purchased_for_self,
      });
    } catch (e) {
      console.error("gift card buyer email", e);
    }
    await maybeSendRecipientNow(giftCardId);
  }

  return { ok: true };
}