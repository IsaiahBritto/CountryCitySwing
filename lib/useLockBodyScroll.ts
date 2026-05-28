"use client";

import { useEffect } from "react";

/** Prevent background page scroll while a modal is open (helps on iOS Safari). */
export function useLockBodyScroll(locked = true) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}
