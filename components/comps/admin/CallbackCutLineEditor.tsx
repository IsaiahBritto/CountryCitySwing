"use client";

import { compBtnOutline, compBtnSecondary } from "@/lib/comps/buttonStyles";

export default function CallbackCutLineEditor({
  callbackCount,
  alternateCount,
  onCallbackCountChange,
  onAlternateCountChange,
  onPreview,
  onApply,
  busy,
  helperText,
  showApply = false,
}: {
  callbackCount: number;
  alternateCount: number;
  onCallbackCountChange: (value: number) => void;
  onAlternateCountChange: (value: number) => void;
  onPreview: () => void;
  onApply?: () => void;
  busy: boolean;
  helperText: string;
  showApply?: boolean;
}) {
  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-900/50 p-3">
      <p className="mb-2 text-xs text-neutral-400">{helperText}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          Call back
          <input
            type="number"
            min={1}
            value={callbackCount}
            onChange={(e) => onCallbackCountChange(Number(e.target.value))}
            className="w-20 rounded-md border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          Alternates
          <input
            type="number"
            min={0}
            max={3}
            value={alternateCount}
            onChange={(e) => onAlternateCountChange(Number(e.target.value))}
            className="w-20 rounded-md border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-white"
          />
        </label>
        <button
          type="button"
          onClick={onPreview}
          disabled={busy}
          className={compBtnSecondary + " text-sm"}
        >
          Update preview
        </button>
        {showApply && onApply && (
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            className={compBtnOutline + " text-sm"}
          >
            Apply changes
          </button>
        )}
      </div>
    </div>
  );
}
