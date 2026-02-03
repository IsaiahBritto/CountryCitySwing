"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function MerchOrderPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ promotionCodeId: string; code: string } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);

  useEffect(() => {
    async function loadOrder() {
      try {
        const { data, error: fetchError } = await supabaseBrowser
          .from("merch_orders")
          .select("*")
          .eq("id", orderId)
          .single();

        if (fetchError || !data) {
          setError("Order not found");
          setLoading(false);
          return;
        }

        // Check if already paid
        if (data.paid) {
          setError("This order has already been paid for.");
          setLoading(false);
          return;
        }

        // Check if payment method is cash
        if (data.payment_method !== "cash") {
          setError("This order is not eligible for cash payment conversion.");
          setLoading(false);
          return;
        }

        setOrder(data);
      } catch (err) {
        console.error("Error loading order:", err);
        setError("Failed to load order information");
      } finally {
        setLoading(false);
      }
    }

    if (orderId) {
      loadOrder();
    }
  }, [orderId]);

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
    if (!order) return;

    setProcessing(true);
    setError("");

    try {
      const body: { orderId: string; promotionCodeId?: string } = { orderId };
      if (appliedPromo) body.promotionCodeId = appliedPromo.promotionCodeId;
      const response = await fetch("/api/merch-order/pay", {
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

  if (error && !order) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/merch")}
            className="bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all"
          >
            Back to Merch
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const orderTotal = Number(order.total);

  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-primary mb-6">Complete Your Payment</h1>

        <div className="bg-neutral-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Order Details</h2>
          <p className="text-gray-300 mb-2">
            <strong>Order Number:</strong> #{order.id}
          </p>
          <p className="text-gray-300 mb-2">
            <strong>Name:</strong> {order.first_name} {order.last_name}
          </p>
          <p className="text-gray-300 mb-2">
            <strong>Email:</strong> {order.email}
          </p>
          <p className="text-gray-300 mb-4">
            <strong>Delivery Method:</strong> {order.delivery_method === "ship" ? "Shipping" : "Local Pickup"}
          </p>
          {orderTotal > 0 && (
            <p className="text-gray-300 mb-4">
              <strong>Total Amount:</strong> ${orderTotal.toFixed(2)}
            </p>
          )}
        </div>

        <div className="bg-neutral-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-3">Order Items</h3>
          <div className="space-y-2">
            {(order.items as any[]).map((item: any, index: number) => (
              <div key={index} className="flex justify-between text-gray-300">
                <span>
                  {item.productName} ({item.size}) × {item.quantity}
                </span>
                <span>${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-neutral-700">
            <div className="flex justify-between text-gray-300 mb-2">
              <span>Subtotal:</span>
              <span>${Number(order.subtotal).toFixed(2)}</span>
            </div>
            {Number(order.shipping) > 0 && (
              <div className="flex justify-between text-gray-300 mb-2">
                <span>Shipping:</span>
                <span>${Number(order.shipping).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-white mt-2">
              <span>Total:</span>
              <span>${orderTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4 mb-6">
          <p className="text-yellow-300 text-sm">
            You initially selected cash payment. You can complete your payment online via Stripe, or pay with cash in person.
          </p>
        </div>

        {/* Promo code */}
        {orderTotal > 0 && (
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

        {orderTotal > 0 ? (
          <button
            onClick={handlePay}
            disabled={processing}
            className="w-full bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? "Processing..." : `Pay $${orderTotal.toFixed(2)} via Stripe`}
          </button>
        ) : (
          <div className="bg-neutral-800 rounded-lg p-6">
            <p className="text-gray-300">
              This order has no amount due. No payment is required.
            </p>
          </div>
        )}

        <button
          onClick={() => router.push("/merch")}
          className="mt-4 text-gray-400 hover:text-white transition-colors"
        >
          ← Back to Merch
        </button>
      </div>
    </div>
  );
}
