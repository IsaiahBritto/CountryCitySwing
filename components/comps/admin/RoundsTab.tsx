"use client";

import { useState } from "react";
import RoundSlotPanel from "@/components/comps/admin/RoundSlotPanel";
import { ROUND_SLOT_ORDER, type RoundSlotRef } from "@/lib/comps/roundChain";
import type { RoundType } from "@/lib/comps/types";

interface RoundRow extends RoundSlotRef {
  scoring_mode: "callback" | "relative_placement";
  callback_count: number | null;
  alternate_count: number;
  round_order: number;
}

export { roundTitle } from "@/lib/comps/roundChain";

export default function RoundsTab({
  competitionId,
  compType,
  entryCount,
  testComp,
  cjInPanel,
  rounds,
  onChanged,
}: {
  competitionId: string;
  compType: "jack_and_jill" | "strictly";
  entryCount: number;
  testComp?: boolean;
  cjInPanel?: boolean;
  rounds: RoundRow[];
  onChanged: () => void;
}) {
  const isJnJ = compType === "jack_and_jill";
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<RoundType | null>(null);

  const handleError = (msg: string) => {
    if (msg.includes("even number of judges")) setWarning(msg);
    else setError(msg);
  };

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {warning && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
          {warning}
        </div>
      )}

      {entryCount > 0 && (
        <p className="mb-4 text-sm text-neutral-400">
          {entryCount} entries.{" "}
          {entryCount <= 8
            ? "Small field — you can enable only Final and skip earlier rounds."
            : "Enable each round you need; skipped rounds are bypassed automatically."}
          {isJnJ && (
            <>
              {" "}
              JnJ finals advancers are seeded automatically when you begin
              check-in on Final.
            </>
          )}
        </p>
      )}

      <div className="space-y-2">
        {ROUND_SLOT_ORDER.map((slotType) => (
          <RoundSlotPanel
            key={slotType}
            competitionId={competitionId}
            roundType={slotType}
            compType={compType}
            entryCount={entryCount}
            testComp={testComp}
            cjInPanel={cjInPanel}
            rounds={rounds}
            expanded={expandedSlot === slotType}
            onToggleExpand={() =>
              setExpandedSlot((s) => (s === slotType ? null : slotType))
            }
            onChanged={() => {
              setError(null);
              onChanged();
            }}
            onError={handleError}
          />
        ))}
      </div>
    </div>
  );
}
