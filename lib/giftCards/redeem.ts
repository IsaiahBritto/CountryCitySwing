import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeGiftCardCodeInput } from "@/lib/giftCards/code";
import { roundCurrency } from "@/lib/utils/paymentHelpers";
import { giftCardPaymentMethodLabel } from "@/lib/giftCards/amount";

export { computeGiftApplyAmount, giftCardPaymentMethodLabel } from "@/lib/giftCards/amount";
import type { GiftCardReferenceType } from "@/lib/giftCards/types";

export type RedeemGiftCardInput = {
  code: string;
  amount: number;
  referenceType: GiftCardReferenceType;
  referenceId: string;
  createdBy?: string | null;
  note?: string | null;
};

export type RedeemGiftCardResult =
  | {
      ok: true;
      giftCardId: string;
      amountApplied: number;
      balanceAfter: number;
      code: string;
    }
  | { ok: false; error: string };

export async function redeemGiftCard(
  input: RedeemGiftCardInput
): Promise<RedeemGiftCardResult> {
  const normalized = normalizeGiftCardCodeInput(input.code);
  const amount = roundCurrency(input.amount);
  if (amount <= 0) {
    return { ok: false, error: "Redemption amount must be greater than zero." };
  }

  const { data: card, error: fetchErr } = await supabaseServer
    .from("gift_cards")
    .select("id,code,balance_remaining,status,paid")
    .eq("code", normalized)
    .single();

  if (fetchErr || !card) {
    return { ok: false, error: "Invalid gift card code." };
  }
  if (!card.paid || card.status === "pending_payment" || card.status === "void") {
    return { ok: false, error: "Gift card is not active." };
  }

  const balance = roundCurrency(Number(card.balance_remaining) || 0);
  if (balance <= 0) {
    return { ok: false, error: "Gift card has no remaining balance." };
  }
  if (amount > balance + 0.0001) {
    return { ok: false, error: "Amount exceeds gift card balance." };
  }

  const balanceAfter = roundCurrency(balance - amount);
  const newStatus = balanceAfter <= 0 ? "depleted" : "active";
  const now = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabaseServer
    .from("gift_cards")
    .update({
      balance_remaining: balanceAfter,
      status: newStatus,
      updated_at: now,
    })
    .eq("id", card.id)
    .eq("balance_remaining", balance)
    .select("id")
    .maybeSingle();

  if (updateErr || !updated) {
    console.error("redeemGiftCard race", updateErr);
    return { ok: false, error: "Could not apply gift card. Please try again." };
  }

  const { error: txErr } = await supabaseServer.from("gift_card_transactions").insert({
    gift_card_id: card.id,
    type: "redeem",
    amount: -amount,
    balance_after: balanceAfter,
    reference_type: input.referenceType,
    reference_id: input.referenceId,
    created_by: input.createdBy ?? null,
    note: input.note ?? null,
  });

  if (txErr) {
    console.error("redeemGiftCard ledger", txErr);
    await supabaseServer
      .from("gift_cards")
      .update({
        balance_remaining: balance,
        status: balance <= 0 ? "depleted" : "active",
        updated_at: now,
      })
      .eq("id", card.id);
    return { ok: false, error: "Failed to record gift card redemption." };
  }

  return {
    ok: true,
    giftCardId: card.id as string,
    amountApplied: amount,
    balanceAfter,
    code: card.code as string,
  };
}
