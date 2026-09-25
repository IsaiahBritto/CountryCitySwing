"use client";

import { compBtnOutline } from "@/lib/comps/buttonStyles";
import type { CallbackJudgingMethod } from "@/lib/comps/types";

export default function CallbackJudgingMethodModal({
  open,
  busy,
  error,
  onChoose,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onChoose: (method: CallbackJudgingMethod) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="callback-method-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl">
        <h2
          id="callback-method-title"
          className="text-lg font-semibold text-white"
        >
          How will you score this round?
        </h2>
        <p className="mt-2 text-sm text-neutral-300">
          Choose one way to enter scores. You can review and tweak in the other
          view after every competitor is scored in your chosen method.
        </p>
        <p className="mt-3 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm font-medium text-red-300">
          You cannot switch methods mid-round until all competitors have scores
          in your chosen view.
        </p>
        {error && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("placement")}
            className={
              compBtnOutline +
              " min-h-12 flex-1 justify-center py-3 text-base font-semibold"
            }
          >
            Yes / No / Alts
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("raw")}
            className={
              compBtnOutline +
              " min-h-12 flex-1 justify-center py-3 text-base font-semibold"
            }
          >
            Raw scores
          </button>
        </div>
      </div>
    </div>
  );
}
