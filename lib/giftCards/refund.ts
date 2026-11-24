import { supabaseServer } from "@/lib/supabaseServer";
import { roundCurrency } from "@/lib/utils/paymentHelpers";
import type { GiftCardReferenceType } from "@/lib/giftCards/types";

export async function reverseGiftCardRedemption(input: {
  giftCardId: string;
  amount: number;
  referenceType: GiftCardReferenceType;
  referenceId: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const amount = roundCurrency(input.amount);
  if (amount <= 0) return { ok: true };

  const { data: card, error: fetchErr } = await supabaseServer
    .from("gift_cards")
    .select("id,balance_remaining,status,initial_amount")
    .eq("id", input.giftCardId)
    .single();

  if (fetchErr || !card) {
    return { ok: false, error: "Gift card not found" };
  }

  const prev = roundCurrency(Number(card.balance_remaining) || 0);
  const balanceAfter = roundCurrency(
    Math.min(Number(card.initial_amount) || Infinity, prev + amount)
  );
  const now = new Date().toISOString();

  const { error: updateErr } = await supabaseServer
    .from("gift_cards")
    .update({
      balance_remaining: balanceAfter,
      status: balanceAfter > 0 ? "active" : card.status,
      updated_at: now,
    })
    .eq("id", input.giftCardId);

  if (updateErr) {
    return { ok: false, error: "Failed to restore gift card balance" };
  }

  await supabaseServer.from("gift_card_transactions").insert({
    gift_card_id: input.giftCardId,
    type: "refund",
    amount,
    balance_after: balanceAfter,
    reference_type: input.referenceType,
    reference_id: input.referenceId,
    note: input.note ?? "Redemption reversed on refund/cancel",
  });

  return { ok: true };
}