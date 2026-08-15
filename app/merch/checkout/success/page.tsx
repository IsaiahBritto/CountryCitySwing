"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/CartContext";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

function SuccessContent() {
  const { clearCart } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const orderId = searchParams.get("order_id");
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let pollAttempts = 0;
    const pollIntervalMs = 3000;
    const maxPollAttempts = 20; // Poll for up to 60 seconds (20 attempts * 3 seconds)
    let isMounted = true;

    async function loadOrder() {
      if (!isMounted || (!sessionId && !orderId)) return;
      
      try {
        const url = orderId 
          ? `/api/merch-order/confirmation?order_id=${orderId}`
          : `/api/merch-order/confirmation?session_id=${sessionId}`;
        
        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok || !result.order) {
          pollAttempts++;
          if (pollAttempts >= maxPollAttempts) {
            if (isMounted) {
              setError("Order not found. Please check your email for confirmation.");
              setLoading(false);
            }
            if (pollInterval) {
              clearInterval(pollInterval);
            }
          }
          return;
        }

        if (isMounted) {
          setOrder(result.order);
          setLoading(false);
        }
        if (pollInterval) {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Error loading order:", err);
        pollAttempts++;
        if (pollAttempts >= maxPollAttempts && isMounted) {
          setError("Failed to load order information");
          setLoading(false);
        }
      }
    }

    if (sessionId || orderId) {
      loadOrder();
      // Only poll for Stripe orders (cash orders are created immediately)
      if (sessionId) {
        pollInterval = setInterval(() => {
          if (pollAttempts < maxPollAttempts && isMounted) {
            loadOrder();
          } else if (pollInterval) {
            clearInterval(pollInterval);
          }
        }, pollIntervalMs);
      }
    } else {
      setError("Invalid confirmation link");
      setLoading(false);
    }

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [sessionId, orderId]);

  // Auto-redirect countdown
  useEffect(() => {
    if (!order || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.push("/merch");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [order, countdown, router]);

  const handleBackToMerch = () => {
    router.push("/merch");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-primary mb-4">Thank you!</h1>
          <p className="text-gray-300 mb-4">
            {error || "Your payment was successful. Please check your email for order confirmation."}
          </p>
          <button
            onClick={handleBackToMerch}
            className="inline-block btn-signup py-3 px-8 font-semibold transition-opacity hover:opacity-90 cursor-pointer"
          >
            Back to Merch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-neutral-800 rounded-lg shadow-[0_0_25px_rgba(187,134,252,0.6)] p-6 sm:p-8 text-center">
        {/* Success Icon */}
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-4">
            <CheckCircleIcon className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-primary mb-2">
            Order Confirmed!
          </h1>
          <p className="text-gray-300">
            {order.paid ? "Your payment was successful" : "Your order has been received"}
          </p>
        </div>

        {/* Order Details */}
        <div className="bg-neutral-700 rounded-lg p-6 mb-6 text-left">
          <h2 className="text-xl font-semibold text-primary mb-4">
            Order Details
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-gray-400 text-sm mb-1">Order Number</p>
              <p className="text-white text-lg font-medium">
                #{order.id}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Name</p>
              <p className="text-white">
                {order.first_name} {order.last_name}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Email</p>
              <p className="text-white">{order.email}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Total</p>
              <p className="text-white text-lg font-semibold">
                ${Number(order.total).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Payment Status</p>
              {order.paid ? (
                <p className="text-green-400 font-semibold">
                  ✓ Paid via Stripe
                </p>
              ) : (
                <p className="text-yellow-400 font-semibold">
                  ⚠ Cash payment needed
                </p>
              )}
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Delivery Method</p>
              <p className="text-white">
                {order.delivery_method === "ship" ? "Shipping" : "Local Pickup"}
              </p>
            </div>
          </div>
        </div>

        {/* Items Summary */}
        <div className="bg-neutral-700 rounded-lg p-6 mb-6 text-left">
          <h3 className="text-lg font-semibold text-primary mb-3">Items Ordered</h3>
          <div className="space-y-2">
            {(order.items as any[]).map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-300">
                  {item.productName} ({item.size}) × {item.quantity}
                </span>
                <span className="text-white font-medium">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Confirmation Message */}
        <div className="mb-6">
          {order.paid ? (
            <>
              <p className="text-gray-300 mb-2">
                Thank you for your order! We'll notify you when it's ready for {order.delivery_method === "ship" ? "shipping" : "pickup"}.
              </p>
              <p className="text-green-400 font-semibold">
                Your payment has been confirmed.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-300 mb-2">
                Thank you for your order! Please pay cash in person when you {order.delivery_method === "ship" ? "receive" : "pick up"} your order.
              </p>
              <div className="bg-yellow-900/20 border-2 border-yellow-600 rounded-lg p-4 mt-3">
                <p className="text-yellow-400 font-semibold mb-1">
                  ⚠ Cash Payment Required
                </p>
                <p className="text-gray-300 text-sm">
                  Please show this confirmation when paying for your order. We'll process your order once payment is received.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Auto-redirect notice */}
        <div className="mb-6">
          <p className="text-gray-400 text-sm">
            Redirecting to merch page in {countdown} second{countdown !== 1 ? "s" : ""}...
          </p>
        </div>

        {/* Continue Button */}
        <button
          onClick={handleBackToMerch}
          className="w-full bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)]"
        >
          Continue Shopping
        </button>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
