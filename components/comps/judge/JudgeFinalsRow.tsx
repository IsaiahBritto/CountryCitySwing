"use client";

import { memo } from "react";
import JudgeRawScoreControls, {
  JudgeRawScoreNudgeButtons,
} from "@/components/comps/judge/JudgeRawScoreControls";
import { judgeTieRowClass, judgeRowReorderFadeClass } from "@/lib/comps/judgeStyles";
import { ordinalLabel } from "@/lib/scoring/finalsSync";

interface SheetEntry {
  roundEntryId: string;
  bibNumber: number | null;
  displayName: string;
  leadDisplayName?: string | null;
  followBibNumber?: number | null;
  followDisplayName?: string | null;
}

function JudgeFinalsRowInner({
  entry,
  raw,
  displayOrdinal,
  isTied,
  locked,
  showThumbs,
  thumbUp,
  thumbDown,
  sliderDraftValue,
  onSliderDraft,
  onSliderCommit,
  onNudge,
  onThumbsUp,
  onThumbsDown,
  reorderFading = false,
}: {
  entry: SheetEntry | undefined;
  raw: number | null;
  displayOrdinal: number | null;
  isTied: boolean;
  locked: boolean;
  showThumbs: boolean;
  thumbUp: number;
  thumbDown: number;
  sliderDraftValue: number | undefined;
  onSliderDraft: (entryId: string, value: number) => void;
  onSliderCommit: (entryId: string, value: number) => void;
  onNudge: (entryId: string, delta: number) => void;
  onThumbsUp: (entryId: string) => void;
  onThumbsDown: (entryId: string) => void;
  reorderFading?: boolean;
}) {
  const entryId = entry?.roundEntryId ?? "";

  return (
    <div
      className={
        "mb-1 flex min-w-0 items-center gap-2 rounded-xl border bg-neutral-800/60 p-2 " +
        (isTied ? judgeTieRowClass : "border-neutral-700") +
        (reorderFading ? ` ${judgeRowReorderFadeClass}` : "")
      }
    >
      <div className="w-10 shrink-0 text-center">
        <div className="text-lg font-bold text-white">
          {entry?.bibNumber ?? "—"}
        </div>
        {entry?.followBibNumber != null && (
          <div className="font-mono text-[10px] text-neutral-500">
            +{entry.followBibNumber}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-primary">
          {displayOrdinal != null ? ordinalLabel(displayOrdinal) : "—"}
        </div>
        {entry?.followDisplayName ? (
          <>
            <div className="truncate text-xs text-neutral-300">
              {entry.leadDisplayName ?? entry.displayName.split(" & ")[0]}
            </div>
            <div className="truncate text-[11px] text-neutral-500">
              {entry.followDisplayName}
            </div>
          </>
        ) : (
          <div className="truncate text-xs text-white">{entry?.displayName}</div>
        )}
        <JudgeRawScoreControls
          entryId={entryId}
          raw={raw}
          sliderDraftValue={sliderDraftValue}
          locked={locked}
          isTied={isTied}
          showThumbs={showThumbs}
          thumbsUp={thumbUp}
          thumbsDown={thumbDown}
          onSliderDraft={onSliderDraft}
          onSliderCommit={onSliderCommit}
          onThumbsUp={onThumbsUp}
          onThumbsDown={onThumbsDown}
        />
      </div>

      <JudgeRawScoreNudgeButtons
        entryId={entryId}
        locked={locked}
        onNudge={onNudge}
      />
    </div>
  );
}

const JudgeFinalsRow = memo(JudgeFinalsRowInner);
export default JudgeFinalsRow;
