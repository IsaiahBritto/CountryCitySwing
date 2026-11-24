import { roundCurrency } from "@/lib/utils/paymentHelpers";

export function giftCardPaymentMethodLabel(
  giftAmount: number,
  secondary: "Cash" | "Stripe" | null
): string {
  if (giftAmount <= 0) return secondary ?? "Cash";
  if (!secondary) return "Gift Card";
  return `Gift Card + ${secondary}`;
}

export function computeGiftApplyAmount(
  balance: number,
  orderTotal: number,
  requestedAmount?: number | null
): number {
  const cap = roundCurrency(Math.min(balance, orderTotal));
  if (requestedAmount == null || Number.isNaN(requestedAmount)) {
    return cap;
  }
  const req = roundCurrency(requestedAmount);
  return roundCurrency(Math.min(req, cap));
}