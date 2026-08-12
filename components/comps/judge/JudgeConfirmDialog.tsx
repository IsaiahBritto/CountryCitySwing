"use client";

import { compBtnOutlineSm } from "@/lib/comps/buttonStyles";

export default function JudgeConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="judge-confirm-title"
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl">
        <h2
          id="judge-confirm-title"
          className="text-base font-semibold text-white"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-neutral-300">{message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={
              compBtnOutlineSm +
              " min-h-11 border-neutral-600 text-neutral-300"
            }
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={compBtnOutlineSm + " min-h-11"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
