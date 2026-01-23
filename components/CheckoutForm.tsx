"use client";

import { useState, useEffect } from "react";
import { ArrowLeftIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useCart } from "./CartContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

interface CheckoutFormProps {
  onBack: () => void;
  onComplete: () => void;
}

export default function CheckoutForm({ onBack, onComplete }: CheckoutFormProps) {
  const { items, getTotalPrice, clearCart } = useCart();
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "ship">("pickup");
  const [canPickupFrom8CC, setCanPickupFrom8CC] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    shippingAddress: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preorderAcknowledged, setPreorderAcknowledged] = useState(false);

  // Auto-fill from user profile if logged in
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabaseBrowser.auth.getUser();
        if (user) {
          const { data: profile } = await supabaseBrowser
            .from("profiles")
            .select("first_name, last_name, email")
            .eq("id", user.id)
            .single();

          // Try profile first, then fall back to user_metadata, then empty string
          setFormData((prev) => ({
            ...prev,
            firstName: profile?.first_name || user.user_metadata?.first_name || "",
            lastName: profile?.last_name || user.user_metadata?.last_name || "",
            email: profile?.email || user.email || "",
          }));
        }
      } catch (err) {
        console.error("Error loading user data:", err);
      }
    };
    loadUserData();
  }, []);

  // Uncheck pickup checkbox when switching away from "ship"
  useEffect(() => {
    if (deliveryMethod === "pickup") {
      setCanPickupFrom8CC(false);
    }
  }, [deliveryMethod]);

  const calculateShipping = () => {
    if (deliveryMethod === "pickup") return 0;
    
    // If canPickupFrom8CC is checked, exclude preorder items from shipping calculation
    if (canPickupFrom8CC) {
      const nonPreorderItems = items.filter(
        (item) =>
          item.productName !== "Black CCS x 8CC Shirt (Preorder)" &&
          item.productName !== "Black CCS x 8CC Crop(Preorder)"
      );
      const totalItems = nonPreorderItems.reduce((sum, item) => sum + item.quantity, 0);
      return Math.ceil(totalItems / 2) * 10;
    }
    
    // Regular shipping calculation for all items
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    return Math.ceil(totalItems / 2) * 10;
  };

  const shippingCost = calculateShipping();
  const totalPrice = getTotalPrice() + shippingCost;

  // Check if cart contains preorder items
  const hasPreorderItems = items.some(
    (item) =>
      item.productName === "Black CCS x 8CC Shirt (Preorder)" ||
      item.productName === "Black CCS x 8CC Crop(Preorder)"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (!formData.firstName || !formData.lastName || !formData.email) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (hasPreorderItems && !preorderAcknowledged) {
      setError("Please acknowledge the preorder disclaimer before continuing");
      setLoading(false);
      return;
    }

    if (deliveryMethod === "ship") {
      if (
        !formData.shippingAddress ||
        !formData.shippingCity ||
        !formData.shippingState ||
        !formData.shippingZip
      ) {
        setError("Please fill in all shipping address fields");
        setLoading(false);
        return;
      }
    }

    try {
      const orderData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        deliveryMethod,
        canPickupFrom8CC,
        shippingAddress:
          deliveryMethod === "ship"
            ? {
                address: formData.shippingAddress,
                city: formData.shippingCity,
                state: formData.shippingState,
                zip: formData.shippingZip,
              }
            : null,
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          productType: item.productType,
          size: item.size,
          price: item.price,
          quantity: item.quantity,
        })),
        subtotal: getTotalPrice(),
        shipping: shippingCost,
        total: totalPrice,
      };

      const response = await fetch("/api/merch-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit order");
      }

      clearCart();
      onComplete();
    } catch (err: any) {
      setError(err.message || "Failed to submit order. Please try again.");
      console.error("Order submission error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-300 hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeftIcon className="w-5 h-5" />
        Back to Shopping
      </button>

      <h2 className="text-3xl font-bold text-primary mb-6">Checkout</h2>

      {/* Order Summary */}
      <div className="bg-neutral-800 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-semibold text-white mb-4">Order Summary</h3>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={`${item.productId}-${item.size}-${index}`}
              className="flex justify-between text-gray-300"
            >
              <span>
                {item.productName} ({item.size}) × {item.quantity}
              </span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        
        {/* Preorder Disclaimer */}
        {hasPreorderItems && (
          <div className="border-t border-neutral-700 mt-4 pt-4 mb-4">
            <div className="bg-yellow-900/20 border-2 border-yellow-600 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preorderAcknowledged}
                        onChange={(e) => setPreorderAcknowledged(e.target.checked)}
                        className="w-5 h-5 mt-0.5 text-primary focus:ring-primary border-neutral-600 bg-neutral-700 rounded"
                      />
                      <span className="text-gray-200 text-sm">
                        I understand that my order contains preorder items which need to be paid for but will be arriving around the start of March.
                      </span>
                    </label>
                  </div>
                  <p className="text-gray-300 text-sm ml-8">
                    If you live in North Carolina and can pick up in person from 8 Count Country, please still click "Ship It" below. However you will not be charged delivery fees for this order. Address is just needed for records sake. Thank you!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delivery Method */}
        <div className="border-t border-neutral-700 mt-4 pt-4 mb-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Delivery Method</h4>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="delivery"
                value="pickup"
                checked={deliveryMethod === "pickup"}
                onChange={(e) => setDeliveryMethod(e.target.value as "pickup")}
                className="w-4 h-4 text-primary focus:ring-primary"
              />
              <span className="text-gray-300">Local Pickup</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="delivery"
                value="ship"
                checked={deliveryMethod === "ship"}
                onChange={(e) => setDeliveryMethod(e.target.value as "ship")}
                className="w-4 h-4 text-primary focus:ring-primary"
              />
              <span className="text-gray-300">Ship it</span>
            </label>
            {hasPreorderItems && deliveryMethod === "ship" && (
              <label className="flex items-center gap-3 cursor-pointer ml-6">
                <input
                  type="checkbox"
                  checked={canPickupFrom8CC}
                  onChange={(e) => {
                    setCanPickupFrom8CC(e.target.checked);
                    // Ensure "Ship it" remains selected
                    if (e.target.checked) {
                      setDeliveryMethod("ship");
                    }
                  }}
                  className="w-4 h-4 text-primary focus:ring-primary border-neutral-600 bg-neutral-700 rounded"
                />
                <span className="text-gray-300">I can pick it up from 8 Count Country</span>
              </label>
            )}
          </div>
        </div>

        <div className="border-t border-neutral-700 pt-4 space-y-2">
          <div className="flex justify-between text-gray-300">
            <span>Subtotal:</span>
            <span>${getTotalPrice().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span>Shipping:</span>
            <span>${shippingCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold text-primary">
            <span>Total:</span>
            <span>${totalPrice.toFixed(2)}</span>
          </div>
          {deliveryMethod === "ship" && (
            <p className="text-xs text-gray-400 mt-2">
              This shipping charge is estimated. If shipping ends up being less
              than the amount shown, Country City Swing will refund you the
              difference.
            </p>
          )}
          {canPickupFrom8CC && (
            <p className="text-xs text-yellow-400 mt-2">
              Note: Shipping fees for preorder items have been waived since you selected pickup from 8 Count Country.
            </p>
          )}
        </div>
      </div>

      {/* Checkout Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <div className="bg-neutral-800 rounded-lg p-6 space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">
            Personal Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                First Name *
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Last Name *
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Shipping Address */}
        {deliveryMethod === "ship" && (
          <div className="bg-neutral-800 rounded-lg p-6 space-y-4">
            <h3 className="text-xl font-semibold text-white mb-4">
              Shipping Address
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Street Address *
              </label>
              <input
                type="text"
                required={deliveryMethod === "ship"}
                value={formData.shippingAddress}
                onChange={(e) =>
                  setFormData({ ...formData, shippingAddress: e.target.value })
                }
                className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  City *
                </label>
                <input
                  type="text"
                  required={deliveryMethod === "ship"}
                  value={formData.shippingCity}
                  onChange={(e) =>
                    setFormData({ ...formData, shippingCity: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  State *
                </label>
                <input
                  type="text"
                  required={deliveryMethod === "ship"}
                  value={formData.shippingState}
                  onChange={(e) =>
                    setFormData({ ...formData, shippingState: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  ZIP Code *
                </label>
                <input
                  type="text"
                  required={deliveryMethod === "ship"}
                  value={formData.shippingZip}
                  onChange={(e) =>
                    setFormData({ ...formData, shippingZip: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Payment Info */}
        <div className="bg-neutral-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Payment</h3>
          <p className="text-gray-300 mb-4">
            Please complete your payment via Venmo:
          </p>
            <a
              href="https://www.venmo.com/u/CountryCitySwing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-semibold"
            >
              @CountryCitySwing on Venmo
            </a>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-red-200">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full btn-signup py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : "Complete Order"}
        </button>
      </form>
    </div>
  );
}
