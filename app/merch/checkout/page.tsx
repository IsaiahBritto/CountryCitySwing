"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartContext";
import CheckoutForm from "@/components/CheckoutForm";

export default function CheckoutPage() {
  const router = useRouter();
  const { items } = useCart();

  // Redirect to merch page if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      router.push("/merch");
    }
  }, [items.length, router]);

  if (items.length === 0) {
    return null; // Will redirect
  }

  return (
    <CheckoutForm
      onBack={() => router.push("/merch?cart=open")}
      onComplete={() => {
        router.push("/merch?order=success");
      }}
    />
  );
}
