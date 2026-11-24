"use client";

import { useEffect, useMemo, useState } from "react";
import { computePartialStripeRefund } from "@/lib/utils/signupRefundAmounts";
import { roundCurrency } from "@/lib/utils/paymentHelpers";

type RefundModalProps = {
  open: boolean;
  onClose: () => void;
  sessionToken: string;
  signupId: string;
  isComp: boolean;
  displayName: string;
  onDone: () => void;
};

type DetailResponse = {
  signup: Record<string, unknown>;
  isComp: boolean;
  synced?: boolean;
  paymentIntentRemainingCents: number;
  priorSums: { principal: number; fee: number; tax: number; amount: number };
  principalPaid: number;
  remainingPrincipal: number;
  giftCard?: { code: string | null; applied: number; refundable: number } | null;
  error?: string;
};

export default function RegistrationRefundModal({
  open,
  onClose,
  sessionToken,
  signupId,
  isComp,
  displayName,
  onDone,
}: RefundModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [principalInput, setPrincipalInput] = useState("");
  const [cashAmountInput, setCashAmountInput] = useState("");
  const [giftAmountInput, setGiftAmountInput] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setPrincipalInput("");
    setCashAmountInput("");
    setGiftAmountInput("");
    setNote("");
    fetch(
      `/api/admin/signup-refund?signupId=${encodeURIComponent(signupId)}&isComp=${isComp}`,
      { headers: { Authorization: `Bearer ${sessionToken}` } }
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load signup");
        if (!cancelled) {
          setDetail(json as DetailResponse);
          if (json.synced) {
            /* status may have updated from Stripe Dashboard */
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, signupId, isComp, sessionToken]);

  const signup = detail?.signup;
  const status = String(signup?.refunded_or_cancelled || "active");
  const modalTitle = displayName.trim() || "Unknown registrant";
  const pm = String(signup?.payment_method || "");
  const paid = signup?.paid === true;
  const piId = typeof signup?.stripe_payment_intent_id === "string"
    ? signup.stripe_payment_intent_id
    : null;
  const isStripe = pm.toLowerCase() === "stripe" || !!piId;
  const isVoucher = pm.toLowerCase() === "class voucher";
  const isCash = ["cash", "ccs team"].includes(pm.toLowerCase());
  const giftCard = detail?.giftCard ?? null;
  const freeViaPromo = signup?.free_via_promotion_code === true;
  const usedPromo = signup?.used_promotion_code === true;
  const collected =
    detail?.principalPaid ??
    Number(signup?.amount_paid ?? signup?.amount_owed ?? 0);

  const preview = useMemo(() => {
    if (!detail || !isStripe) return null;
    const principalRefund = roundCurrency(Number(principalInput));
    if (!(principalRefund > 0)) return null;
    return computePartialStripeRefund({
      principalRefund,
      principalPaid: detail.principalPaid,
      stripeProcessingFee:
        signup?.stripe_processing_fee != null
          ? Number(signup.stripe_processing_fee)
          : null,
      stripeTaxAmount:
        signup?.stripe_tax_amount != null ? Number(signup.stripe_tax_amount) : null,
      priorRefunds: [],
      paymentIntentRemainingCents: detail.paymentIntentRemainingCents,
    });
  }, [detail, isStripe, principalInput, signup]);

  // Use prior sums for remaining fee/tax via API remainingPrincipal; recompute with priors for accurate preview
  const previewWithPriors = useMemo(() => {
    if (!detail || !isStripe) return null;
    const principalRefund = roundCurrency(Number(principalInput));
    if (!(principalRefund > 0)) return null;
    return computePartialStripeRefund({
      principalRefund,
      principalPaid: detail.principalPaid,
      stripeProcessingFee:
        signup?.stripe_processing_fee != null
          ? Number(signup.stripe_processing_fee)
          : null,
      stripeTaxAmount:
        signup?.stripe_tax_amount != null ? Number(signup.stripe_tax_amount) : null,
      priorRefunds: [
        {
          principal_refunded: detail.priorSums.principal,
          fee_refunded: detail.priorSums.fee,
          tax_refunded: detail.priorSums.tax,
          amount_refunded: detail.priorSums.amount,
        },
      ],
      paymentIntentRemainingCents: detail.paymentIntentRemainingCents,
    });
  }, [detail, isStripe, principalInput, signup]);

  void preview; // prefer previewWithPriors

  const submit = async (body: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/signup-refund", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signupId, isComp, note: note || undefined, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Refund failed");
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-600 bg-neutral-900 p-5 text-neutral-200 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{modalTitle}</h2>
            <p className="text-sm text-neutral-400">Refund / cancel registration</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            Close
          </button>
        </div>

        {loading && <p className="mt-4 text-sm text-neutral-400">Loading…</p>}
        {error && (
          <p className="mt-4 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        {detail && signup && (
          <div className="mt-4 space-y-3 text-sm">
            {detail.synced && (
              <p className="rounded border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-amber-100">
                Synced status from Stripe (Dashboard refund detected).
              </p>
            )}
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/80 p-3 space-y-1">
              <p>
                <span className="text-neutral-400">Payment:</span>{" "}
                <span className="text-white">{pm || "—"}</span>
                {" · "}
                <span className="text-white">{paid ? "Paid" : "Unpaid"}</span>
                {" · "}
                <span className="text-white capitalize">{status}</span>
              </p>
              <p>
                <span className="text-neutral-400">
                  {giftCard ? (piId ? "Stripe portion collected:" : "Cash portion collected:") : "Collected:"}
                </span>{" "}
                <span className="text-white">${Number(collected).toFixed(2)}</span>
              </p>
              {giftCard && (
                <p>
                  <span className="text-neutral-400">
                    Gift card{giftCard.code ? ` (${giftCard.code})` : ""}:
                  </span>{" "}
                  <span className="text-white">${giftCard.applied.toFixed(2)}</span>
                  <span className="text-neutral-400">
                    {" "}· refundable ${giftCard.refundable.toFixed(2)}
                  </span>
                </p>
              )}
              {signup.stripe_tax_amount != null && (
                <p>
                  <span className="text-neutral-400">Stripe tax:</span> $
                  {Number(signup.stripe_tax_amount).toFixed(2)}
                </p>
              )}
              {signup.stripe_processing_fee != null && (
                <p>
                  <span className="text-neutral-400">CCS processing fee:</span> $
                  {Number(signup.stripe_processing_fee).toFixed(2)}
                </p>
              )}
              {signup.stripe_total_paid != null && (
                <p>
                  <span className="text-neutral-400">Stripe total paid:</span> $
                  {Number(signup.stripe_total_paid).toFixed(2)}
                </p>
              )}
              {usedPromo && (
                <p className="text-amber-200">Promo used · Collected ${Number(collected).toFixed(2)}</p>
              )}
              {freeViaPromo && (
                <p className="text-amber-200">Free via promo · Collected $0.00</p>
              )}
              {isStripe && (
                <p>
                  <span className="text-neutral-400">Stripe remaining:</span> $
                  {(detail.paymentIntentRemainingCents / 100).toFixed(2)}
                  {!piId && (
                    <span className="text-red-300"> (missing payment intent)</span>
                  )}
                </p>
              )}
              {detail.priorSums.amount > 0 && (
                <p>
                  <span className="text-neutral-400">Already refunded:</span> $
                  {detail.priorSums.amount.toFixed(2)}
                </p>
              )}
            </div>

            {status === "cancelled" ? (
              <p className="text-neutral-400">This registration is already cancelled.</p>
            ) : (
              <>
                <label className="block">
                  <span className="text-neutral-400">Note (optional)</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-white"
                  />
                </label>

                {giftCard && paid && (
                  <div className="space-y-3 border-t border-neutral-700 pt-3">
                    <p className="font-medium text-white">Refund gift card and/or {piId ? "Stripe" : "cash"}</p>
                    <label className="block">
                      <span className="text-neutral-400">
                        Restore to gift card (max ${giftCard.refundable.toFixed(2)})
                      </span>
                      <div className="mt-1 flex gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={giftAmountInput}
                          onChange={(e) => setGiftAmountInput(e.target.value)}
                          disabled={giftCard.refundable <= 0}
                          className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-white disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={giftCard.refundable <= 0}
                          onClick={() => setGiftAmountInput(giftCard.refundable.toFixed(2))}
                          className="rounded-md border border-neutral-500 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                        >
                          Max
                        </button>
                      </div>
                    </label>
                    <label className="block">
                      <span className="text-neutral-400">
                        {piId ? "Refund to card via Stripe" : "Refund in cash"} (max $
                        {detail.remainingPrincipal.toFixed(2)})
                      </span>
                      <div className="mt-1 flex gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={piId ? principalInput : cashAmountInput}
                          onChange={(e) =>
                            piId
                              ? setPrincipalInput(e.target.value)
                              : setCashAmountInput(e.target.value)
                          }
                          disabled={detail.remainingPrincipal <= 0}
                          className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-white disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={detail.remainingPrincipal <= 0}
                          onClick={() => {
                            const max = detail.remainingPrincipal.toFixed(2);
                            if (piId) setPrincipalInput(max);
                            else setCashAmountInput(max);
                          }}
                          className="rounded-md border border-neutral-500 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                        >
                          Max
                        </button>
                      </div>
                    </label>
                    {piId && previewWithPriors?.ok && (
                      <p className="text-neutral-300">
                        Computed total to Stripe:{" "}
                        <strong className="text-white">${previewWithPriors.total.toFixed(2)}</strong>
                        {previewWithPriors.fee > 0 || previewWithPriors.tax > 0
                          ? " (includes proportional fee/tax)"
                          : ""}
                      </p>
                    )}
                    {piId && previewWithPriors && !previewWithPriors.ok && principalInput && (
                      <p className="text-red-300">{previewWithPriors.error}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          submitting ||
                          !(Number(giftAmountInput) > 0 ||
                            Number(piId ? principalInput : cashAmountInput) > 0)
                        }
                        onClick={() =>
                          submit({
                            mode: "partial",
                            giftRefundAmount: Number(giftAmountInput) || 0,
                            ...(piId
                              ? { principalAmount: Number(principalInput) || 0 }
                              : { amountRefunded: Number(cashAmountInput) || 0 }),
                          })
                        }
                        className="rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-600 disabled:opacity-50"
                      >
                        Refund entered amounts
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => submit({ mode: "full" })}
                        className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        Full refund of both (cancel)
                      </button>
                    </div>
                    <p className="text-xs text-neutral-400">
                      The registration is cancelled once both the gift card and {piId ? "Stripe" : "cash"} portions are fully refunded.
                    </p>
                  </div>
                )}

                {!giftCard && isStripe && piId && paid && detail.paymentIntentRemainingCents > 0 && (
                  <div className="space-y-3 border-t border-neutral-700 pt-3">
                    <p className="font-medium text-white">Stripe refund</p>
                    <label className="block">
                      <span className="text-neutral-400">
                        Principal to refund (max ${detail.remainingPrincipal.toFixed(2)})
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={principalInput}
                        onChange={(e) => setPrincipalInput(e.target.value)}
                        className="mt-1 w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-white"
                      />
                    </label>
                    {previewWithPriors?.ok && (
                      <p className="text-neutral-300">
                        Computed total to Stripe:{" "}
                        <strong className="text-white">
                          ${previewWithPriors.total.toFixed(2)}
                        </strong>
                        {" "}(principal ${previewWithPriors.principal.toFixed(2)}
                        {previewWithPriors.fee > 0
                          ? ` + fee $${previewWithPriors.fee.toFixed(2)}`
                          : ""}
                        {previewWithPriors.tax > 0
                          ? ` + tax $${previewWithPriors.tax.toFixed(2)}`
                          : ""}
                        )
                        {previewWithPriors.treatsAsFull ? " · will fully cancel" : ""}
                      </p>
                    )}
                    {previewWithPriors && !previewWithPriors.ok && principalInput && (
                      <p className="text-red-300">{previewWithPriors.error}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={submitting || !(Number(principalInput) > 0)}
                        onClick={() =>
                          submit({
                            mode: "partial",
                            principalAmount: Number(principalInput),
                          })
                        }
                        className="rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-600 disabled:opacity-50"
                      >
                        Partial refund
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => submit({ mode: "full" })}
                        className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        Full refund (cancel)
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() =>
                          submit({ mode: "partial", refundRemaining: true })
                        }
                        className="rounded-md border border-neutral-500 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                      >
                        Refund remaining balance
                      </button>
                    </div>
                  </div>
                )}

                {!giftCard && isStripe && paid && !piId && (
                  <p className="text-amber-200">
                    Missing Stripe payment intent. Run the signup Stripe ID backfill or refund in the
                    Stripe Dashboard, then reopen this modal to sync.
                  </p>
                )}

                {!giftCard && isCash && paid && (
                  <div className="space-y-3 border-t border-neutral-700 pt-3">
                    <p className="font-medium text-white">Cash refund</p>
                    <label className="block">
                      <span className="text-neutral-400">Amount refunded in cash</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cashAmountInput}
                        onChange={(e) => setCashAmountInput(e.target.value)}
                        className="mt-1 w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-white"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={submitting || !(Number(cashAmountInput) > 0)}
                        onClick={() =>
                          submit({
                            mode: "partial",
                            amountRefunded: Number(cashAmountInput),
                          })
                        }
                        className="rounded-md bg-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-600 disabled:opacity-50"
                      >
                        Record partial cash refund
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() =>
                          submit({
                            mode: "full",
                            amountRefunded:
                              Number(cashAmountInput) > 0
                                ? Number(cashAmountInput)
                                : collected,
                          })
                        }
                        className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        Full cancel (cash)
                      </button>
                    </div>
                  </div>
                )}

                {(isVoucher || !paid || freeViaPromo || (collected <= 0 && !giftCard)) && !isStripe && (
                  <div className="space-y-2 border-t border-neutral-700 pt-3">
                    <p className="text-neutral-300">
                      {isVoucher
                        ? "Class voucher is not refunded. You can cancel this registration."
                        : "Nothing was paid — cancel registration (no money owed)."}
                    </p>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => submit({ mode: "cancel_unpaid" })}
                      className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      Cancel registration
                    </button>
                  </div>
                )}

                {!paid && isStripe && (
                  <div className="space-y-2 border-t border-neutral-700 pt-3">
                    <p className="text-neutral-300">
                      Not marked paid — cancel registration (no money owed).
                    </p>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => submit({ mode: "cancel_unpaid" })}
                      className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      Cancel registration
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
