"use client";

import { ReactNode } from "react";

/**
 * Shared modal shell for event and comp signups. Same sizing, purple glow, and scroll behavior for all signup modals.
 */
export default function SignupModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 text-white max-w-lg w-full mx-4 rounded-lg shadow-[0_0_25px_rgba(187,134,252,0.6)] overflow-y-auto max-h-[90vh]"
      >
        <div className="flex justify-between items-center p-4 border-b border-neutral-700">
          <h3 className="text-2xl font-bold text-primary">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-6 text-left space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
