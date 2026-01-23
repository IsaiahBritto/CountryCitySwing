"use client";

import { ReactNode } from "react";
import { CartProvider } from "./CartContext";

export default function CartProviderWrapper({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
