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
      <div className="pointer-events-auto max-w-2xl mx-auto rounded-xl border border-neutral-600 bg-neutral-900/95 backdrop-blur px-4 py-3 sm:px-5 sm:py-4 shadow-lg text-sm text-gray-300">
        <p>
          We use essential cookies and local storage for sign-in, carts, and social song requests. See
          our{" "}
          <Link href="/cookies" className="text-primary underline hover:text-yellow-300">
            Cookie Policy
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-primary underline hover:text-yellow-300">
            Privacy Policy
          </Link>
          .
        </p>
        <button
          type="button"
          className="mt-3 w-full sm:w-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-neutral-900 hover:opacity-90"
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
  );
}
