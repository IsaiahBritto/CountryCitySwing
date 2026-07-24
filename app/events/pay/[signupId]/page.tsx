"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EventPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const signupId = params.signupId as string;
  const [loading, setLoading] = useState(true);
  const [signup, setSignup] = useState<any>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [eventPrice, setEventPrice] = useState(0);
  const [registeredAt, setRegisteredAt] = useState<number | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ promotionCodeId: string; code: string; discountedSubtotal?: number } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);

  useEffect(() => {
    async function loadSignup() {
      try {
        const res = await fetch(
          `/api/event-signup/pay?signupId=${encodeURIComponent(signupId)}`
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Signup not found");
          setLoading(false);
          return;
        }

        setSignup(data.signup);
        setEventPrice(data.eventPrice ?? data.dueNow ?? 0);
        setRegisteredAt(
          data.registeredAt != null
            ? Number(data.registeredAt)
            : data.signup?.amount_owed != null
              ? Number(data.signup.amount_owed)
              : null
        );
      } catch (err) {
        console.error("Error loading signup:", err);
        setError("Failed to load signup information");
      } finally {
        setLoading(false);
      }
    }

    if (signupId) {
      loadSignup();
    }
  }, [signupId]);

  const applyPromo = async () => {
    const code = promoCodeInput.trim();
    if (!code) {
      setPromoError("Please enter a promotion code.");
      return;
    }
    setPromoError("");
    setPromoLoading(true);
    try {
      const res = await fetch("/api/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal: eventPrice }),
      });
      const result = await res.json();
      if (result.valid && result.promotionCodeId) {
        setAppliedPromo({
          promotionCodeId: result.promotionCodeId,
          code: result.code ?? code,
          discountedSubtotal: result.discountedSubtotal,
        });
      } else {
        setAppliedPromo(null);
        setPromoError(result.message || "Invalid promotion code.");
      }
    } catch {
      setAppliedPromo(null);
      setPromoError("Could not validate code.");
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setPromoCodeInput("");
    setPromoError("");
  };

  // Amount due after discount: use discounted subtotal when promo applied, else event price
  const amountDue =
    appliedPromo?.discountedSubtotal != null ? appliedPromo.discountedSubtotal : eventPrice;
  const noPaymentRequired = amountDue <= 0.5;

  const handlePay = async () => {
    if (!signup) return;

    setProcessing(true);
    setError("");

    try {
      const body: { signupId: string; promotionCodeId?: string; discountedSubtotal?: number } = {
        signupId,
      };
      if (appliedPromo) {
        body.promotionCodeId = appliedPromo.promotionCodeId;
        if (appliedPromo.discountedSubtotal != null)
          body.discountedSubtotal = appliedPromo.discountedSubtotal;
      }
      const response = await fetch("/api/event-signup/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create payment session");
      }

      if (data.noPaymentRequired) {
        setSignup((prev: Record<string, unknown> | null) =>
          prev ? { ...prev, paid: true, amount_owed: 0 } : null
        );
        setEventPrice(0);
        setAppliedPromo(null);
        setPromoCodeInput("");
        setError("");
        setProcessing(false);
        return;
      }

      if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        setError("No payment URL received");
        setProcessing(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to process payment");
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !signup) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/events")}
            className="bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all"
          >
            Back to Events
          </button>
        </div>
      </div>
    );
  }

  if (!signup) {
    return null;
  }


  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-primary mb-6">Complete Your Payment</h1>

        <div className="bg-neutral-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Event Details</h2>
          <p className="text-gray-300 mb-2">
            <strong>Event:</strong> {signup.event_title}
          </p>
          <p className="text-gray-300 mb-2">
            <strong>Name:</strong> {signup.first_name} {signup.last_name}
          </p>
          <p className="text-gray-300 mb-2">
            <strong>Email:</strong> {signup.email}
          </p>
          {(eventPrice > 0 || amountDue <= 0.5 || (signup.amount_owed != null && Number(signup.amount_owed) === 0)) && (
            <div className="text-gray-300 mb-4 space-y-1">
              {registeredAt != null && (
                <p>
                  <strong>Registered at:</strong> ${Number(registeredAt).toFixed(2)}
                </p>
              )}
              <p>
                <strong>Due now:</strong> ${Math.max(0, amountDue).toFixed(2)}
                {appliedPromo?.discountedSubtotal != null && (
                  <span className="text-green-400 text-sm ml-1">(after discount)</span>
                )}
              </p>
              <p className="text-sm text-gray-400">
                Online payment uses the current event price (not the price when you registered).
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4 mb-6">
          <p className="text-yellow-300 text-sm">
            You initially selected cash payment. You can complete your payment online via Stripe, or pay with cash at the door.
          </p>
        </div>

        {/* Promo code - only for Class Voucher (voucher/discount flow) */}
        {eventPrice > 0 && !signup.paid && signup.payment_method === "Class Voucher" && (
          <div className="bg-neutral-800 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">Promotion code</h3>
            {appliedPromo ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-green-400 text-sm">
                  Applied: {appliedPromo.code}
                  {appliedPromo.discountedSubtotal != null && (
                    <> — Amount due: ${Math.max(0, appliedPromo.discountedSubtotal).toFixed(2)}</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={removePromo}
                  className="text-sm text-gray-400 hover:text-white underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={promoCodeInput}
                  onChange={(e) => {
                    setPromoCodeInput(e.target.value);
                    setPromoError("");
                  }}
                  placeholder="Enter code"
                  className="flex-1 min-w-[120px] px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={promoLoading}
                />
                <button
                  type="button"
                  onClick={applyPromo}
                  disabled={promoLoading}
                  className="px-4 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500 text-sm font-medium disabled:opacity-50 text-white"
                >
                  {promoLoading ? "Checking…" : "Apply"}
                </button>
              </div>
            )}
            {promoError && <p className="text-red-400 text-sm mt-1">{promoError}</p>}
          </div>
        )}

        {noPaymentRequired ? (
          <div className="bg-neutral-800 rounded-lg p-6 mb-6">
            <p className="text-gray-300">
              {signup.paid
                ? "No payment required. Your promotion code covered the full cost. You're all set!"
                : "Your promotion code covered the full cost. No payment is required."}
            </p>
            {!signup.paid && (
              <button
                onClick={handlePay}
                disabled={processing}
                className="w-full mt-4 bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? "Confirming…" : "Confirm — no payment required"}
              </button>
            )}
          </div>
        ) : eventPrice > 0 ? (
          <button
            onClick={handlePay}
            disabled={processing}
            className="w-full bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? "Processing..." : `Pay $${amountDue.toFixed(2)} via Stripe`}
          </button>
        ) : (
          <div className="bg-neutral-800 rounded-lg p-6">
            <p className="text-gray-300">
              {signup.paid || (signup.amount_owed != null && Number(signup.amount_owed) === 0)
                ? "No payment required. Your promotion code covered the full cost."
                : "This event is free. No payment is required."}
            </p>
          </div>
        )}

        <button
          onClick={() => router.push("/events")}
          className="mt-4 text-gray-400 hover:text-white transition-colors"
        >
          ← Back to Events
        </button>
      </div>
    </div>
  );
}
