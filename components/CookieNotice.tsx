"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "ccs_cookie_notice_ack";

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
      setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 pointer-events-none"
    >
      <div className="pointer-events-auto max-w-3xl mx-auto rounded-xl border border-neutral-600 bg-neutral-900/95 backdrop-blur px-4 py-3 sm:px-5 sm:py-3.5 shadow-lg text-sm text-gray-300">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <p className="min-w-0 flex-1 leading-snug">
            We use essential cookies and local storage for sign-in, carts, and social song requests.
            See our{" "}
            <Link href="/cookies" className="text-yellow-400 underline hover:text-yellow-300">
              Cookie Policy
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-yellow-400 underline hover:text-yellow-300">
              Privacy Policy
            </Link>
            .
          </p>
          <button
            type="button"
            className="shrink-0 self-end sm:self-center rounded-lg border border-yellow-400 bg-yellow-400 px-5 py-2 text-sm font-semibold text-neutral-900 shadow-[0_0_12px_rgba(242,201,76,0.35)] transition-colors hover:bg-yellow-300 whitespace-nowrap"
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* ignore */
            }
            setVisible(false);
          }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
