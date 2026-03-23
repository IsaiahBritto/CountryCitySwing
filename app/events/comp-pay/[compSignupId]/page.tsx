"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function CompPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const compSignupId = params.compSignupId as string;
  const [loading, setLoading] = useState(true);
  const [signup, setSignup] = useState<any>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function loadSignup() {
      try {
        const { data, error: fetchError } = await supabaseBrowser
          .from("comp_signups")
          .select("id,event_title,payment_method,amount_owed,paid")
          .eq("id", compSignupId)
          .single();

        if (fetchError || !data) {
          setError("Comp signup not found");
          setLoading(false);
          return;
        }
        if (data.paid) {
          setError("This comp signup has already been paid.");
          setLoading(false);
          return;
        }
        if (data.payment_method !== "Cash") {
          setError("This page is for cash signups. Your payment method is " + (data.payment_method || "—") + ".");
          setLoading(false);
          return;
        }
        setSignup(data);
      } catch (err) {
        console.error("Error loading comp signup:", err);
        setError("Failed to load signup information");
      } finally {
        setLoading(false);
      }
    }

    if (compSignupId) loadSignup();
  }, [compSignupId]);

  const amountDue = signup ? Number(signup.amount_owed) || 0 : 0;
  const noPaymentRequired = amountDue <= 0;

  const handlePay = async () => {
    if (!signup) return;
    setProcessing(true);
    setError("");
    try {
      const res = await fetch("/api/comp-signup/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compSignupId: signup.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment session");
      if (data.noPaymentRequired) {
        setSignup((prev: any) => (prev ? { ...prev, paid: true, amount_owed: 0 } : null));
        setProcessing(false);
        return;
      }
      if (data.redirect) window.location.href = data.redirect;
      else setError("No payment URL received");
    } catch (err: any) {
      setError(err.message || "Failed to process payment");
    } finally {
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
            className="bg-accent text-white px-6 py-2 rounded-md font-semibold"
          >
            Back to Events
          </button>
        </div>
      </div>
    );
  }

  if (!signup) return null;

  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-primary mb-6">Complete Your Comp Payment</h1>

        <div className="bg-neutral-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Comp Details</h2>
          <p className="text-gray-300 mb-2">
            <strong>Event:</strong> {signup.event_title}
          </p>
          {amountDue > 0 && (
            <p className="text-gray-300 mb-4">
              <strong>Amount due:</strong> ${amountDue.toFixed(2)}
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
            You selected cash payment. You can pay online via Stripe below or with cash at the door.
          </p>
        </div>

        {noPaymentRequired ? (
          <div className="bg-neutral-800 rounded-lg p-6 mb-6">
            <p className="text-gray-300">No payment required for this signup.</p>
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={processing}
            className="w-full bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? "Processing..." : `Pay $${amountDue.toFixed(2)} via Stripe`}
          </button>
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
