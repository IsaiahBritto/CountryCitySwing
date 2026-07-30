import { roundCurrency } from "@/lib/utils/paymentHelpers";

export type RefundBreakdownPrior = {
  principal_refunded: number;
  fee_refunded: number;
  tax_refunded: number;
  amount_refunded: number;
};

export type PartialRefundComputeInput = {
  principalRefund: number;
  principalPaid: number;
  stripeProcessingFee: number | null;
  stripeTaxAmount: number | null;
  priorRefunds: RefundBreakdownPrior[];
  paymentIntentRemainingCents: number;
};

export type PartialRefundComputeResult = {
  ok: true;
  principal: number;
  fee: number;
  tax: number;
  total: number;
  totalCents: number;
  fraction: number;
  treatsAsFull: boolean;
} | {
  ok: false;
  error: string;
};

export function sumPriorRefunds(priors: RefundBreakdownPrior[]): {
  principal: number;
  fee: number;
  tax: number;
  amount: number;
} {
  return priors.reduce(
    (acc, r) => ({
      principal: roundCurrency(acc.principal + Number(r.principal_refunded || 0)),
      fee: roundCurrency(acc.fee + Number(r.fee_refunded || 0)),
      tax: roundCurrency(acc.tax + Number(r.tax_refunded || 0)),
      amount: roundCurrency(acc.amount + Number(r.amount_refunded || 0)),
    }),
    { principal: 0, fee: 0, tax: 0, amount: 0 }
  );
}

/**
 * Compute Stripe partial refund: principal + proportional CCS fee + tax.
 * Null fee/tax columns are omitted (0). Caps at PaymentIntent remaining.
 */
export function computePartialStripeRefund(
  input: PartialRefundComputeInput
): PartialRefundComputeResult {
  const principalPaid = Number(input.principalPaid);
  const principalRefund = roundCurrency(Number(input.principalRefund));
  if (!(principalPaid > 0)) {
    return { ok: false, error: "No principal paid to refund against." };
  }
  if (!(principalRefund > 0)) {
    return { ok: false, error: "Principal refund must be greater than zero." };
  }

  const prior = sumPriorRefunds(input.priorRefunds);
  const remainingPrincipal = roundCurrency(principalPaid - prior.principal);
  if (principalRefund > remainingPrincipal + 0.001) {
    return {
      ok: false,
      error: `Principal refund exceeds remaining ($${remainingPrincipal.toFixed(2)}).`,
    };
  }

  const fraction = Math.min(1, Math.max(0, principalRefund / principalPaid));
  const feePool =
    input.stripeProcessingFee != null && Number.isFinite(Number(input.stripeProcessingFee))
      ? Number(input.stripeProcessingFee)
      : 0;
  const taxPool =
    input.stripeTaxAmount != null && Number.isFinite(Number(input.stripeTaxAmount))
      ? Number(input.stripeTaxAmount)
      : 0;

  let fee = feePool > 0 ? roundCurrency(fraction * feePool) : 0;
  let tax = taxPool > 0 ? roundCurrency(fraction * taxPool) : 0;

  const remainingFee = roundCurrency(Math.max(0, feePool - prior.fee));
  const remainingTax = roundCurrency(Math.max(0, taxPool - prior.tax));
  fee = Math.min(fee, remainingFee);
  tax = Math.min(tax, remainingTax);

  let total = roundCurrency(principalRefund + fee + tax);
  let totalCents = Math.round(total * 100);
  const remainingPi = Math.max(0, Math.floor(input.paymentIntentRemainingCents));

  if (totalCents > remainingPi) {
    totalCents = remainingPi;
    total = roundCurrency(totalCents / 100);
  }

  const treatsAsFull = remainingPi > 0 && totalCents >= remainingPi;

  return {
    ok: true,
    principal: principalRefund,
    fee,
    tax,
    total,
    totalCents,
    fraction,
    treatsAsFull,
  };
}
