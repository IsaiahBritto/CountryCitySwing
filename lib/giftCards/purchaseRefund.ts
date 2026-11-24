import { getStripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import { roundCurrency } from "@/lib/utils/paymentHelpers";

export type RefundGiftCardPurchaseInput = {
  giftCardId: string;
  amount: number;
  adminUserId: string;
  note?: string | null;
};

async function loadPaymentIntentRemainingCents(
  paymentIntentId: string
): Promise<{ remainingCents: number }> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  const piAmount = pi.amount_received ?? pi.amount ?? 0;
  let chargeAmount = piAmount;
  let refundedCents = 0;

  const latest = pi.latest_charge;
  if (latest && typeof latest === "object" && !("deleted" in latest && latest.deleted)) {
    const charge = latest as { amount?: number | null; amount_refunded?: number | null };
    chargeAmount = charge.amount ?? piAmount;
    refundedCents = charge.amount_refunded ?? 0;
  } else if (typeof latest === "string" && latest) {
    const charge = await stripe.charges.retrieve(latest);
    chargeAmount = charge.amount ?? piAmount;
    refundedCents = charge.amount_refunded ?? 0;
  }

  return {
    remainingCents: Math.max(0, chargeAmount - refundedCents),
  };
}

export async function refundGiftCardPurchaseBalance(
  input: RefundGiftCardPurchaseInput
): Promise<
  | { ok: true; amountRefunded: number; balanceAfter: number; stripeRefundId?: string }
  | { ok: false; error: string }
> {
  const refundAmount = roundCurrency(input.amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return { ok: false, error: "Refund amount must be greater than zero." };
  }
  if (!Number.isInteger(refundAmount)) {
    return { ok: false, error: "Refund amount must be whole dollars." };
  }

  const { data: card, error: fetchErr } = await supabaseServer
    .from("gift_cards")
    .select(
      "id,code,payment_method,paid,status,balance_remaining,initial_amount,stripe_payment_intent_id"
    )
    .eq("id", input.giftCardId)
    .single();

  if (fetchErr || !card) {
    return { ok: false, error: "Gift card not found." };
  }
  if (!card.paid) {
    return { ok: false, error: "Gift card purchase is not paid." };
  }
  if (card.status === "void" || card.status === "pending_payment") {
    return { ok: false, error: "This gift card cannot be refunded." };
  }

  const balance = roundCurrency(Number(card.balance_remaining) || 0);
  if (balance <= 0) {
    return { ok: false, error: "No balance remains on this gift card." };
  }
  if (refundAmount > balance + 0.0001) {
    return {
      ok: false,
      error: `Refund cannot exceed remaining balance ($${balance.toFixed(0)}).`,
    };
  }

  const method = (card.payment_method ?? "").toLowerCase();
  if (method !== "stripe" && method !== "cash") {
    return { ok: false, error: "Unknown original payment method." };
  }

  const refundCents = Math.round(refundAmount * 100);
  let stripeRefundId: string | undefined;

  if (method === "stripe") {
    const piId = card.stripe_payment_intent_id;
    if (!piId) {
      return {
        ok: false,
        error: "Stripe payment intent missing; cannot refund to card.",
      };
    }
    const piState = await loadPaymentIntentRemainingCents(piId);
    if (refundCents > piState.remainingCents) {
      return {
        ok: false,
        error:
          "Refund exceeds remaining Stripe charge balance. Partial Stripe refunds may already exist on this purchase.",
      };
    }

    const { count: priorCount } = await supabaseServer
      .from("gift_card_transactions")
      .select("id", { count: "exact", head: true })
      .eq("gift_card_id", input.giftCardId)
      .eq("type", "refund")
      .eq("reference_type", "gift_card")
      .lt("amount", 0);

    const idempotencyKey = `gift-card-purchase-refund:${input.giftCardId}:${refundCents}:n${priorCount ?? 0}`;
    const stripe = getStripe();
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: piId, amount: refundCents },
        { idempotencyKey }
      );
      stripeRefundId = refund.id;
    } catch (e) {
      console.error("gift card stripe refund", e);
      return { ok: false, error: "Stripe refund failed." };
    }
  }

  const balanceAfter = roundCurrency(balance - refundAmount);
  const newStatus = balanceAfter <= 0 ? "void" : card.status === "depleted" ? "depleted" : "active";
  const now = new Date().toISOString();

  const { error: updateErr } = await supabaseServer
    .from("gift_cards")
    .update({
      balance_remaining: balanceAfter,
      status: newStatus,
      updated_at: now,
    })
    .eq("id", input.giftCardId)
    .eq("balance_remaining", balance);

  if (updateErr) {
    console.error("gift card refund balance update", updateErr);
    return {
      ok: false,
      error:
        method === "stripe"
          ? "Stripe refund succeeded but gift card balance was not updated. Contact support."
          : "Failed to update gift card balance.",
    };
  }

  const { error: txErr } = await supabaseServer.from("gift_card_transactions").insert({
    gift_card_id: input.giftCardId,
    type: "refund",
    amount: -refundAmount,
    balance_after: balanceAfter,
    reference_type: "gift_card",
    reference_id: stripeRefundId ?? input.giftCardId,
    created_by: input.adminUserId,
    note:
      input.note?.trim() ||
      (method === "stripe"
        ? "Purchase balance refunded to original card (Stripe)"
        : "Purchase balance refunded in cash"),
  });

  if (txErr) {
    console.error("gift card purchase refund ledger", txErr);
  }

  return { ok: true, amountRefunded: refundAmount, balanceAfter, stripeRefundId };
}