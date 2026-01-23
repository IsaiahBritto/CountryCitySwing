"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { XMarkIcon, ShoppingCartIcon } from "@heroicons/react/24/outline";
import { useCart } from "./CartContext";

interface CartProps {
  initialOpen?: boolean;
}

export default function Cart({ initialOpen = false }: CartProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, removeFromCart, updateQuantity, getTotalItems, getTotalPrice } =
    useCart();

  // Check URL parameter for cart=open
  useEffect(() => {
    if (searchParams.get("cart") === "open") {
      setIsOpen(true);
      // Clean up URL by removing the query parameter after a short delay
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("cart");
        router.replace(url.pathname + (url.search || ""), { scroll: false });
      }, 100);
    }
  }, [searchParams, router]);

  const handleCheckout = () => {
    if (items.length === 0) {
      alert("Your cart is empty");
      return;
    }
    setIsOpen(false); // Close cart sidebar
    router.push("/merch/checkout");
  };

  return (
    <>
      {/* Cart Icon with Badge */}
      <div className="relative inline-block">
        <button
          onClick={() => setIsOpen(true)}
          className="text-gray-300 hover:text-primary transition-colors"
          aria-label="Shopping cart"
        >
          <ShoppingCartIcon className="w-6 h-6" />
        </button>
        {getTotalItems() > 0 && (
          <span className="absolute -top-2 -right-2 bg-primary text-white-500 text-xs font-extrabold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow-lg z-50 border-2 border-white pointer-events-none">
            {getTotalItems() > 99 ? "99+" : getTotalItems()}
          </span>
        )}
      </div>

      {/* Cart Sidebar */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Cart Panel */}
          <div className="w-full max-w-md bg-neutral-800 shadow-xl overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-primary">Shopping Cart</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-300 hover:text-primary transition-colors"
                  aria-label="Close cart"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Cart Items */}
              {items.length === 0 ? (
                <p className="text-gray-400 text-center py-8">
                  Your cart is empty
                </p>
              ) : (
                <div className="space-y-4 mb-6">
                  {items.map((item, index) => (
                    <div
                      key={`${item.productId}-${item.size}-${index}`}
                      className="bg-neutral-700 rounded-lg p-4"
                    >
                      <div className="flex gap-4">
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="w-20 h-20 object-cover rounded"
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-white">
                            {item.productName}
                          </h3>
                          <p className="text-sm text-gray-400">
                            Size: {item.size}
                          </p>
                          <p className="text-primary font-semibold">
                            ${item.price.toFixed(2)}
                          </p>

                          {/* Quantity Controls */}
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.size,
                                  item.quantity - 1
                                )
                              }
                              className="bg-neutral-600 hover:bg-neutral-500 text-white w-6 h-6 rounded flex items-center justify-center text-sm"
                            >
                              -
                            </button>
                            <span className="text-white w-8 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.size,
                                  item.quantity + 1
                                )
                              }
                              className="bg-neutral-600 hover:bg-neutral-500 text-white w-6 h-6 rounded flex items-center justify-center text-sm"
                            >
                              +
                            </button>
                            <button
                              onClick={() =>
                                removeFromCart(item.productId, item.size)
                              }
                              className="ml-auto text-red-400 hover:text-red-300 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total and Checkout */}
              {items.length > 0 && (
                <div className="border-t border-neutral-700 pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-semibold text-white">Total:</span>
                    <span className="text-xl font-bold text-primary">
                      ${getTotalPrice().toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={handleCheckout}
                    className="w-full btn-signup py-3 text-lg font-semibold"
                  >
                    Checkout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
