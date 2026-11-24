import { supabaseServer } from "@/lib/supabaseServer";
import { generateGiftCardCode } from "@/lib/giftCards/code";
import { roundCurrency } from "@/lib/utils/paymentHelpers";

export type IssueGiftCardAfterPaymentInput = {
  giftCardId: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  paymentConfirmedBy?: string | null;
};

export async function issueGiftCardAfterPayment(
  input: IssueGiftCardAfterPaymentInput
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const { giftCardId } = input;

  const { data: card, error: fetchErr } = await supabaseServer
    .from("gift_cards")
    .select("id,initial_amount,code,status,paid")
    .eq("id", giftCardId)
    .single();

  if (fetchErr || !card) {
    return { ok: false, error: "Gift card not found" };
  }
  if (card.paid && card.code && card.status === "active") {
    return { ok: true, code: card.code as string };
  }

  const code = card.code ?? (await generateGiftCardCode());
  const amount = roundCurrency(Number(card.initial_amount) || 0);
  const now = new Date().toISOString();

  const { error: updateErr } = await supabaseServer
    .from("gift_cards")
    .update({
      code,
      balance_remaining: amount,
      status: "active",
      paid: true,
      paid_at: now,
      payment_confirmed_by: input.paymentConfirmedBy ?? null,
      stripe_session_id: input.stripeSessionId ?? null,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
      updated_at: now,
    })
    .eq("id", giftCardId);

  if (updateErr) {
    console.error("issueGiftCardAfterPayment", updateErr);
    return { ok: false, error: "Failed to activate gift card" };
  }

  const { error: txErr } = await supabaseServer.from("gift_card_transactions").insert({
    gift_card_id: giftCardId,
    type: "purchase",
    amount,
    balance_after: amount,
    reference_type: "gift_card",
    reference_id: giftCardId,
    note: "Card issued after payment",
  });

  if (txErr) {
    console.error("issueGiftCardAfterPayment ledger", txErr);
  }

  return { ok: true, code };
}