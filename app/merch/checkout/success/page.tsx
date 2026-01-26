"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/components/CartContext";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

export default function CheckoutSuccessPage() {
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
      <h1 className="text-3xl font-bold text-primary mb-4">Thank you!</h1>
      <p className="text-gray-300 mb-8">
        Your order has been received. You’ll get a confirmation email shortly
        with your order details.
      </p>
      <Link
        href="/merch"
        className="inline-block btn-signup py-3 px-8 font-semibold"
      >
        Back to Merch
      </Link>
    </div>
  );
}
