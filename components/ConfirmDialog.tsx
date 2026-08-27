"use client";

import { compBtnOutlineSm } from "@/lib/comps/buttonStyles";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl">
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-white"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-neutral-300">{message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={
              compBtnOutlineSm +
              " min-h-11 border-neutral-600 text-neutral-300 disabled:opacity-50"
            }
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              compBtnOutlineSm +
              " min-h-11 disabled:opacity-50" +
              (destructive
                ? " border-red-500/50 text-red-300 hover:border-red-400"
                : "")
            }
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
