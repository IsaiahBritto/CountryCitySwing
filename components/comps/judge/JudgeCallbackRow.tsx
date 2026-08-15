"use client";

import { memo } from "react";
import CallbackVoteBadge from "@/components/comps/judge/CallbackVoteBadge";
import JudgeRawScoreControls, {
  JudgeRawScoreNudgeButtons,
} from "@/components/comps/judge/JudgeRawScoreControls";
import { judgeTieBadgeClass, judgeRowReorderFadeClass } from "@/lib/comps/judgeStyles";
import type { CallbackVote } from "@/lib/scoring/callbackRawSync";

interface SheetEntry {
  roundEntryId: string;
  bibNumber: number | null;
  displayName: string;
  heatNumber: number | null;
}

function JudgeCallbackRowInner({
  entry,
  mode,
  vote,
  raw,
  isConflicted,
  rowTone,
  locked,
  showThumbs,
  thumbUp,
  thumbDown,
  sliderDraftValue,
  altOptions,
  onSetVote,
  onSliderDraft,
  onSliderCommit,
  onNudgeRaw,
  onThumbsUp,
  onThumbsDown,
  reorderFading = false,
}: {
  entry: SheetEntry;
  mode: "placement" | "raw";
  vote: CallbackVote | undefined;
  raw: number | null;
  isConflicted: boolean;
  rowTone: string;
  locked: boolean;
  showThumbs: boolean;
  thumbUp: number;
  thumbDown: number;
  sliderDraftValue: number | undefined;
  altOptions: CallbackVote[];
  onSetVote: (entryId: string, vote: CallbackVote) => void;
  onSliderDraft: (entryId: string, value: number) => void;
  onSliderCommit: (entryId: string, value: number) => void;
  onNudgeRaw: (entryId: string, delta: number) => void;
  onThumbsUp: (entryId: string) => void;
  onThumbsDown: (entryId: string) => void;
  reorderFading?: boolean;
}) {
  const voteBtnLocked = locked ? " opacity-60" : "";
  const voteBtnNeutral =
    "min-h-9 rounded-md border border-neutral-600 px-1 py-1.5 text-xs font-semibold text-neutral-400 active:bg-neutral-700 sm:min-h-11 sm:px-2.5 sm:py-2 sm:text-sm";
  const voteBtnNeutralActiveYes =
    "min-h-9 rounded-md border border-green-600 bg-green-600 px-1 py-1.5 text-xs font-semibold text-white sm:min-h-11 sm:px-2.5 sm:py-2 sm:text-sm";
  const voteBtnNeutralActiveAlt =
    "min-h-9 rounded-md border border-amber-500 bg-amber-500 px-1 py-1.5 text-xs font-semibold text-neutral-900 sm:min-h-11 sm:px-2.5 sm:py-2 sm:text-sm";
  const voteBtnNeutralActiveNo =
    "min-h-9 rounded-md border border-red-600 bg-red-600 px-1 py-1.5 text-xs font-semibold text-white sm:min-h-11 sm:px-2.5 sm:py-2 sm:text-sm";
  const voteBtnCount = 2 + altOptions.length;

  return (
    <div
      className={
        (mode === "raw"
          ? `flex min-w-0 items-center gap-2 rounded-xl border p-2 ${rowTone}`
          : `flex flex-col gap-2 rounded-xl border p-2 ${rowTone}`) +
        (reorderFading ? ` ${judgeRowReorderFadeClass}` : "")
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div
          className={
            mode === "raw"
              ? "w-10 shrink-0 text-center"
              : "flex h-9 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-900/80 font-mono text-base font-bold text-white"
          }
        >
          {mode === "raw" ? (
            <div className="text-lg font-bold text-white">
              {entry.bibNumber ?? "—"}
            </div>
          ) : (
            (entry.bibNumber ?? "—")
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-sm text-neutral-300">
              {entry.displayName}
            </div>
            {mode === "raw" && <CallbackVoteBadge vote={vote} />}
          </div>
          {isConflicted && mode !== "raw" && (
            <span className={`mt-0.5 inline-block ${judgeTieBadgeClass}`}>
              tied — resolve
            </span>
          )}
          {mode === "raw" && (
            <JudgeRawScoreControls
              entryId={entry.roundEntryId}
              raw={raw}
              sliderDraftValue={sliderDraftValue}
              locked={locked}
              isTied={isConflicted}
              showThumbs={showThumbs}
              thumbsUp={thumbUp}
              thumbsDown={thumbDown}
              onSliderDraft={onSliderDraft}
              onSliderCommit={onSliderCommit}
              onThumbsUp={onThumbsUp}
              onThumbsDown={onThumbsDown}
            />
          )}
        </div>
      </div>

      {mode === "raw" ? (
        <JudgeRawScoreNudgeButtons
          entryId={entry.roundEntryId}
          locked={locked}
          onNudge={onNudgeRaw}
        />
      ) : (
        <div
          className={
            "grid w-full gap-1 " +
            (voteBtnCount === 4 ? "grid-cols-4" : "grid-cols-5")
          }
        >
          <button
            type="button"
            onClick={() => onSetVote(entry.roundEntryId, "yes")}
            disabled={locked}
            className={
              (vote === "yes" ? voteBtnNeutralActiveYes : voteBtnNeutral) +
              voteBtnLocked
            }
          >
            Yes
          </button>
          {altOptions.map((rank) => (
            <button
              key={rank}
              type="button"
              onClick={() => onSetVote(entry.roundEntryId, rank)}
              disabled={locked}
              className={
                (vote === rank ? voteBtnNeutralActiveAlt : voteBtnNeutral) +
                voteBtnLocked
              }
            >
              {rank.replace("alt", "A")}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onSetVote(entry.roundEntryId, "no")}
            disabled={locked}
            className={
              (vote === "no" ? voteBtnNeutralActiveNo : voteBtnNeutral) +
              voteBtnLocked
            }
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}

const JudgeCallbackRow = memo(JudgeCallbackRowInner);
export default JudgeCallbackRow;
