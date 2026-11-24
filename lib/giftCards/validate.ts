import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeGiftCardCodeInput } from "@/lib/giftCards/code";
import type { GiftCardRow } from "@/lib/giftCards/types";

export type ValidateGiftCardResult =
  | { ok: true; card: GiftCardRow; balance: number; maskedCode: string }
  | { ok: false; message: string };

function maskCode(code: string): string {
  const parts = code.split("-");
  if (parts.length >= 3) {
    return `${parts[0]}-****-${parts[parts.length - 1]!.slice(-2)}`;
  }
  return "CCS-****";
}

export async function validateGiftCard(
  rawCode: string
): Promise<ValidateGiftCardResult> {
  const code = normalizeGiftCardCodeInput(rawCode);
  if (!code) {
    return { ok: false, message: "Please enter a gift card code." };
  }

  const { data, error } = await supabaseServer
    .from("gift_cards")
    .select(
      "id,code,initial_amount,balance_remaining,status,payment_method,paid,purchased_for_self,buyer_email,recipient_email,recipient_email_status,deliver_at,personal_message,recipient_name,buyer_name,deliver_timezone"
    )
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("validateGiftCard", error);
    return { ok: false, message: "Could not validate gift card." };
  }
  if (!data) {
    return {
      ok: false,
      message:
        "We couldn't find a gift card with that code. Please check the code and try again.",
    };
  }
  if (data.status === "void") {
    return { ok: false, message: "This gift card is no longer valid." };
  }
  if (data.status === "pending_payment" || !data.paid) {
    return { ok: false, message: "This gift card is not yet active." };
  }
  if (data.status !== "active" && data.status !== "depleted") {
    return { ok: false, message: "This gift card is not available." };
  }

  const balance = Number(data.balance_remaining) || 0;
  if (balance <= 0 || data.status === "depleted") {
    return { ok: false, message: "This gift card has no remaining balance." };
  }

  return {
    ok: true,
    card: data as GiftCardRow,
    balance,
    maskedCode: maskCode(data.code as string),
  };
}