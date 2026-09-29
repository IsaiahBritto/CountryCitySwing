"use client";

import { ReactNode } from "react";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

/**
 * Shared modal shell for event and comp signups. Mobile-safe: dvh cap, safe-area
 * insets, scrollable body, optional pinned footer (e.g. Submit on iOS Safari).
 */
export default function SignupModalShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useLockBodyScroll(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/60 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(90dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-neutral-900 text-white shadow-[0_0_25px_rgba(187,134,252,0.6)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 p-4">
          <h3 id="signup-modal-title" className="text-2xl font-bold text-primary pr-2">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pb-4 text-left">
          <div className="space-y-4">{children}</div>
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-neutral-700 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
