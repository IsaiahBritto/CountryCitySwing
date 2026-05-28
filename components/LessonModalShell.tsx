"use client";

import { ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

interface LessonModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
}

/**
 * Mobile-safe modal shell for private-lesson flows.
 * Caps height with dvh, keeps close visible, scrolls body content.
 */
export default function LessonModalShell({
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = "max-w-md",
}: LessonModalShellProps) {
  useLockBodyScroll(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full ${maxWidthClassName} max-h-[min(90dvh,100%)] flex-col overflow-hidden rounded-lg border border-yellow-400/30 bg-neutral-900 text-white shadow-lg`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h3
            id="lesson-modal-title"
            className="text-xl font-semibold text-primary pr-2"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-neutral-400 hover:text-primary"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-neutral-700 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
