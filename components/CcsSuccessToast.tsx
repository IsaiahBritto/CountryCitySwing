"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface CcsSuccessToastProps {
  message: string;
  open: boolean;
  onClose: () => void;
  durationMs?: number;
  variant?: "success" | "warning";
}

export default function CcsSuccessToast({
  message,
  open,
  onClose,
  durationMs = 5000,
  variant = "success",
}: CcsSuccessToastProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      onCloseRef.current();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [open, durationMs]);

  if (typeof document === "undefined" || !open || !message) return null;

  const isWarning = variant === "warning";

  return createPortal(
    <button
      type="button"
      onClick={onClose}
      className={`fixed top-5 right-5 z-[9999] max-w-sm w-[calc(100%-2.5rem)] text-left rounded-lg border bg-neutral-900/95 p-4 transition-all ${
        isWarning
          ? "border-amber-500/80 shadow-[0_0_18px_rgba(245,158,11,0.35)] hover:border-amber-400"
          : "border-primary/70 shadow-[0_0_18px_rgba(242,201,76,0.45)] hover:border-primary"
      }`}
      aria-label={isWarning ? "Dismiss warning message" : "Dismiss success message"}
    >
      <p
        className={`font-semibold text-sm mb-1 ${
          isWarning ? "text-amber-400" : "text-primary"
        }`}
      >
        {isWarning ? "Booking saved" : "Success"}
      </p>
      <p className="text-gray-100 text-sm leading-relaxed">{message}</p>
      <p className="text-gray-400 text-xs mt-2">Click to close</p>
    </button>,
    document.body
  );
}
