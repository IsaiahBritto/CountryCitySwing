"use client";

import { compBtnOutlineLg, judgeSheetStickyBottom } from "@/lib/comps/buttonStyles";
import {
  judgeSheetFooterActions,
  judgeSheetFooterHint,
} from "@/lib/comps/judgeStyles";

export interface JudgeSheetFooterAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export default function JudgeSheetStickyFooter({
  hint,
  primary,
}: {
  hint?: string | null;
  primary?: JudgeSheetFooterAction | null;
}) {
  if (!hint && !primary) return null;

  return (
    <div className={judgeSheetStickyBottom}>
      <div className={judgeSheetFooterActions}>
        {hint ? <p className={judgeSheetFooterHint}>{hint}</p> : null}
        {primary ? (
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled ?? primary.loading}
            className={compBtnOutlineLg}
          >
            {primary.loading
              ? (primary.loadingLabel ?? "Loading…")
              : primary.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
