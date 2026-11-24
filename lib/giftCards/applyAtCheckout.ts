import { validateGiftCard } from "@/lib/giftCards/validate";
import {
  computeGiftApplyAmount,
  giftCardPaymentMethodLabel,
  redeemGiftCard,
} from "@/lib/giftCards/redeem";
import { supabaseServer } from "@/lib/supabaseServer";
import { roundCurrency } from "@/lib/utils/paymentHelpers";

export type ResolvedGiftCardApplication = {
  giftCardCode: string;
  giftCardId: string;
  amountApplied: number;
  remainder: number;
  paymentMethod: string;
  paid: boolean;
};

export async function resolveGiftCardApplication(input: {
  giftCardCode?: string | null;
  giftCardAmount?: number | null;
  orderTotal: number;
  basePaymentMethod: "Cash" | "Stripe" | "cash" | "stripe";
}): Promise<
  | { ok: true; none: true }
  | { ok: true; none: false; resolved: ResolvedGiftCardApplication }
  | { ok: false; error: string }
> {
  const code = input.giftCardCode?.trim();
  if (!code) return { ok: true, none: true };

  const validated = await validateGiftCard(code);
  if (!validated.ok) {
    return { ok: false, error: validated.message };
  }

  const orderTotal = roundCurrency(input.orderTotal);
  const amountApplied = computeGiftApplyAmount(
    validated.balance,
    orderTotal,
    input.giftCardAmount
  );
  const remainder = roundCurrency(Math.max(0, orderTotal - amountApplied));
  const base =
    String(input.basePaymentMethod).toLowerCase() === "stripe" ? "Stripe" : "Cash";
  const paid = remainder <= 0.5;
  const paymentMethod = giftCardPaymentMethodLabel(
    amountApplied,
    paid ? null : base
  );

  return {
    ok: true,
    none: false,
    resolved: {
      giftCardCode: validated.card.code!,
      giftCardId: validated.card.id,
      amountApplied,
      remainder,
      paymentMethod,
      paid,
    },
  };
}

export async function commitGiftCardRedemptionForSignup(input: {
  giftCardCode: string;
  amount: number;
  signupId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data: existingTx } = await supabaseServer
    .from("gift_card_transactions")
    .select("id")
    .eq("reference_type", "signup")
    .eq("reference_id", String(input.signupId))
    .eq("type", "redeem")
    .maybeSingle();
  if (existingTx) return { ok: true };

  const r = await redeemGiftCard({
    code: input.giftCardCode,
    amount: input.amount,
    referenceType: "signup",
    referenceId: String(input.signupId),
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

export async function redeemPendingGiftOnSignupPaid(signupId: string): Promise<void> {
  const { data: signup } = await supabaseServer
    .from("signups")
    .select("gift_card_code,gift_card_amount_applied,paid")
    .eq("id", signupId)
    .single();
  if (!signup?.paid || !signup.gift_card_code) return;
  const amount = Number(signup.gift_card_amount_applied) || 0;
  if (amount <= 0) return;
  await commitGiftCardRedemptionForSignup({
    giftCardCode: signup.gift_card_code,
    amount,
    signupId: String(signupId),
  });
}