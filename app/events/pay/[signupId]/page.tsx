"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import eventsData from "@/lib/events.json";

export default function EventPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const signupId = params.signupId as string;
  const [loading, setLoading] = useState(true);
  const [signup, setSignup] = useState<any>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [eventPrice, setEventPrice] = useState(0);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ promotionCodeId: string; code: string } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);

  useEffect(() => {
    async function loadSignup() {
      try {
        const { data, error: fetchError } = await supabaseBrowser
          .from("signups")
          .select("*")
          .eq("id", signupId)
          .single();

        if (fetchError || !data) {
          setError("Signup not found");
          setLoading(false);
          return;
        }

        // Check if already paid
        if (data.paid) {
          setError("This event has already been paid for.");
          setLoading(false);
          return;
        }

        // Check if payment method is Cash
        if (data.payment_method !== "Cash") {
          setError("This signup is not eligible for cash payment conversion.");
          setLoading(false);
          return;
        }

        setSignup(data);

        // Use stored amount_owed (after discount) when present; otherwise fetch event price
        const storedAmountOwed = data.amount_owed != null ? Number(data.amount_owed) : null;
        if (storedAmountOwed !== null && storedAmountOwed >= 0) {
          setEventPrice(storedAmountOwed);
          return;
        }
        let price = 0;
        if (data.event_id) {
          try {
            const { data: eventData } = await supabaseBrowser
              .from("events")
              .select("price")
              .eq("id", data.event_id)
              .single();
            if (eventData?.price) {
              price = Number(eventData.price);
            }
          } catch (e) {
            const event = (eventsData as any[]).find((e: any) => e.id === data.event_id);
            if (event?.price) {
              price = Number(event.price);
            }
          }
        }
        setEventPrice(price);
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
        body: JSON.stringify({ code }),
      });
      const result = await res.json();
      if (result.valid && result.promotionCodeId) {
        setAppliedPromo({ promotionCodeId: result.promotionCodeId, code: result.code ?? code });
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

  const handlePay = async () => {
    if (!signup) return;

    setProcessing(true);
    setError("");

    try {
      const body: { signupId: string; promotionCodeId?: string } = { signupId };
      if (appliedPromo) body.promotionCodeId = appliedPromo.promotionCodeId;
      const response = await fetch("/api/event-signup/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create payment session");
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
          {(eventPrice > 0 || (signup.amount_owed != null && Number(signup.amount_owed) === 0)) && (
            <p className="text-gray-300 mb-4">
              <strong>Amount due:</strong> ${eventPrice.toFixed(2)}
              {signup.amount_owed != null && (
                <span className="text-green-400 text-sm ml-1">(after discount)</span>
              )}
            </p>
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

        {/* Promo code */}
        {eventPrice > 0 && (
          <div className="bg-neutral-800 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">Promotion code</h3>
            {appliedPromo ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-green-400 text-sm">Applied: {appliedPromo.code}</span>
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

        {eventPrice > 0 ? (
          <button
            onClick={handlePay}
            disabled={processing}
            className="w-full bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? "Processing..." : `Pay $${eventPrice.toFixed(2)} via Stripe`}
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
