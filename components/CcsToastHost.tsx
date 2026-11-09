"use client";

import { useEffect, useState } from "react";
import CcsSuccessToast from "@/components/CcsSuccessToast";
import {
  CCS_SUCCESS_TOAST_EVENT,
  CCS_WARNING_TOAST_EVENT,
  isCcsSuccessToastEvent,
  isCcsWarningToastEvent,
} from "@/lib/ccsSuccessToastBus";

type ToastState = {
  message: string;
  variant: "success" | "warning";
  durationMs?: number;
} | null;

export default function CcsToastHost() {
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    const onSuccess = (e: Event) => {
      if (!isCcsSuccessToastEvent(e)) return;
      const msg = e.detail?.message?.trim();
      if (msg) {
        const durationMs =
          typeof e.detail?.durationMs === "number" ? e.detail.durationMs : undefined;
        setToast({ message: msg, variant: "success", durationMs });
      }
    };
    const onWarning = (e: Event) => {
      if (!isCcsWarningToastEvent(e)) return;
      const msg = e.detail?.message?.trim();
      if (msg) setToast({ message: msg, variant: "warning" });
    };
    window.addEventListener(CCS_SUCCESS_TOAST_EVENT, onSuccess);
    window.addEventListener(CCS_WARNING_TOAST_EVENT, onWarning);
    return () => {
      window.removeEventListener(CCS_SUCCESS_TOAST_EVENT, onSuccess);
      window.removeEventListener(CCS_WARNING_TOAST_EVENT, onWarning);
    };
  }, []);

  return (
    <CcsSuccessToast
      open={!!toast}
      message={toast?.message || ""}
      variant={toast?.variant || "success"}
      durationMs={
        toast?.durationMs ?? (toast?.variant === "warning" ? 8000 : 5000)
      }
      onClose={() => setToast(null)}
    />
  );
}
