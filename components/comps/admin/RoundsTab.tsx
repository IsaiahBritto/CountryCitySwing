"use client";

import { useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import RoundSlotPanel from "@/components/comps/admin/RoundSlotPanel";
import { ROUND_SLOT_ORDER, roundTitle, type RoundSlotRef } from "@/lib/comps/roundChain";
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
  rounds,
  onChanged,
}: {
  competitionId: string;
  compType: "jack_and_jill" | "strictly";
  entryCount: number;
  rounds: RoundRow[];
  onChanged: () => void;
}) {
  const isJnJ = compType === "jack_and_jill";
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<RoundType | null>(null);
  const [drawLead, setDrawLead] = useState("");
  const [drawFollow, setDrawFollow] = useState("");
  const [drawing, setDrawing] = useState(false);

  const callbackRounds = rounds.filter((r) => r.scoring_mode === "callback");
  const tabulatedCallbacks = callbackRounds.filter((r) =>
    ["tabulated", "published"].includes(r.status)
  );
  const hasFinals = rounds.some((r) => r.round_type === "final");

  const handleError = (msg: string) => {
    if (msg.includes("even number of judges")) setWarning(msg);
    else setError(msg);
  };

  const runDraw = async () => {
    if (!drawLead || !drawFollow) return;
    setDrawing(true);
    setError(null);
    const res = await authedFetch(`/api/admin/comps/${competitionId}/draw`, {
      method: "POST",
      body: JSON.stringify({
        lead_round_id: drawLead,
        follow_round_id: drawFollow,
      }),
    });
    setDrawing(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    onChanged();
  };

  const inputCls =
    "rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white";

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
        </p>
      )}

      {/* JnJ random draw — shown inside Final slot context when expanded, or here when ready */}
      {isJnJ && !hasFinals && tabulatedCallbacks.length >= 2 && (
        <div className="mb-4 rounded-xl border border-primary/40 bg-neutral-800/60 p-4">
          <h3 className="mb-1 font-semibold text-white">Finals random draw</h3>
          <p className="mb-3 text-sm text-neutral-400">
            Pairs advancing leads with advancing follows at random and creates
            the finals round.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              value={drawLead}
              onChange={(e) => setDrawLead(e.target.value)}
              className={inputCls}
            >
              <option value="">Leads round…</option>
              {tabulatedCallbacks
                .filter((r) => r.judged_role === "lead")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {roundTitle(r)}
                  </option>
                ))}
            </select>
            <select
              value={drawFollow}
              onChange={(e) => setDrawFollow(e.target.value)}
              className={inputCls}
            >
              <option value="">Follows round…</option>
              {tabulatedCallbacks
                .filter((r) => r.judged_role === "follow")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {roundTitle(r)}
                  </option>
                ))}
            </select>
            <button
              onClick={runDraw}
              disabled={drawing || !drawLead || !drawFollow}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {drawing ? "Drawing…" : "Run draw & create finals"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {ROUND_SLOT_ORDER.map((slotType) => (
          <RoundSlotPanel
            key={slotType}
            competitionId={competitionId}
            roundType={slotType}
            compType={compType}
            entryCount={entryCount}
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
