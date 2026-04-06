"use client";

import { useEffect, useState } from "react";
import CcsSuccessToast from "@/components/CcsSuccessToast";
import {
  CCS_SUCCESS_TOAST_EVENT,
  isCcsSuccessToastEvent,
} from "@/lib/ccsSuccessToastBus";

export default function CcsToastHost() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onToast = (e: Event) => {
      if (!isCcsSuccessToastEvent(e)) return;
      const msg = e.detail?.message?.trim();
      if (msg) setMessage(msg);
    };
    window.addEventListener(CCS_SUCCESS_TOAST_EVENT, onToast);
    return () => window.removeEventListener(CCS_SUCCESS_TOAST_EVENT, onToast);
  }, []);

  return (
    <CcsSuccessToast
      open={!!message}
      message={message}
      onClose={() => setMessage("")}
    />
  );
}
