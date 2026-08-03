"use client";

import { useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnPrimary, compBtnTabActive } from "@/lib/comps/buttonStyles";
import RoundPanel from "@/components/comps/admin/RoundPanel";
import {
  getSlotLabel,
  roundTitle,
  roundsForSlot,
  type RoundSlotRef,
} from "@/lib/comps/roundChain";
import type { RoundType } from "@/lib/comps/types";

interface RoundRow extends RoundSlotRef {
  scoring_mode: "callback" | "relative_placement";
  callback_count: number | null;
  alternate_count: number;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-neutral-700/60 text-neutral-300",
  checkin: "bg-amber-500/20 text-amber-300",
  open: "bg-green-500/20 text-green-400",
  closed: "bg-blue-500/20 text-blue-300",
  tabulated: "bg-primary/20 text-primary",
  published: "bg-primary/30 text-primary",
};

function SlotRoundPanel({
  round,
  onChanged,
  onDisable,
}: {
  round: RoundRow;
  onChanged: () => void;
  onDisable: () => void;
}) {
  return (
    <div>
      {round.status === "pending" && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={onDisable}
            className="text-xs text-neutral-500 hover:text-red-400"
          >
            Disable round
          </button>
        </div>
      )}
      <RoundPanel roundId={round.id} onChanged={onChanged} />
    </div>
  );
}

function EnableForm({
  competitionId,
  roundType,
  judgedRole,
  isCallback,
  defaultCallbacks,
  defaultAlternates,
  onEnabled,
  onError,
}: {
  competitionId: string;
  roundType: RoundType;
  judgedRole: "lead" | "follow" | null;
  isCallback: boolean;
  defaultCallbacks: number;
  defaultAlternates: number;
  onEnabled: () => void;
  onError: (msg: string) => void;
}) {
  const [callbacks, setCallbacks] = useState(defaultCallbacks);
  const [alternates, setAlternates] = useState(defaultAlternates);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await authedFetch(`/api/admin/comps/${competitionId}/rounds`, {
      method: "POST",
      body: JSON.stringify({
        round_type: roundType,
        judged_role: judgedRole,
        callback_count: isCallback ? callbacks : undefined,
        alternate_count: isCallback ? alternates : undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      onError(await apiError(res));
      return;
    }
    const data = await res.json();
    if (data.warning) onError(data.warning);
    onEnabled();
  };

  const inputCls =
    "rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white";

  return (
    <div className="mt-3 rounded-lg border border-dashed border-neutral-600 bg-neutral-900/40 p-4">
      <p className="mb-3 text-sm text-neutral-400">
        Enable this round to include it in the competition. Skipped rounds are
        bypassed when advancing competitors.
      </p>
      {isCallback && (
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            Call back
            <input
              type="number"
              min={1}
              value={callbacks}
              onChange={(e) => setCallbacks(Number(e.target.value))}
              className={inputCls + " w-20"}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            Alternates
            <input
              type="number"
              min={0}
              max={3}
              value={alternates}
              onChange={(e) => setAlternates(Number(e.target.value))}
              className={inputCls + " w-20"}
            />
          </label>
        </div>
      )}
      <button
        onClick={save}
        disabled={busy}
        className={compBtnPrimary}
      >
        {busy ? "Enabling…" : "Enable round"}
      </button>
    </div>
  );
}

export default function RoundSlotPanel({
  competitionId,
  roundType,
  compType,
  entryCount,
  rounds,
  expanded,
  onToggleExpand,
  onChanged,
  onError,
}: {
  competitionId: string;
  roundType: RoundType;
  compType: "jack_and_jill" | "strictly";
  entryCount: number;
  rounds: RoundRow[];
  expanded: boolean;
  onToggleExpand: () => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const isJnJ = compType === "jack_and_jill";
  const isFinal = roundType === "final";
  const isCallback = !isFinal;
  const slotRounds = roundsForSlot(rounds, roundType) as RoundRow[];
  const skipped = slotRounds.length === 0;
  const [jnjTab, setJnjTab] = useState<"lead" | "follow">("lead");

  const disableRound = async (round: RoundRow) => {
    if (!confirm(`Disable ${roundTitle(round)}?`)) return;
    const params = new URLSearchParams({ round_type: round.round_type });
    if (round.judged_role) params.set("judged_role", round.judged_role);
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/rounds?${params}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      onError(await apiError(res));
      return;
    }
    onChanged();
  };

  const slotStatus = skipped
    ? null
    : slotRounds.every((r) => r.status === "published")
      ? "published"
      : slotRounds.some((r) => ["open", "checkin"].includes(r.status))
        ? "active"
        : slotRounds[0]?.status;

  const configSummary = isCallback
    ? slotRounds
        .map(
          (r) =>
            `${r.judged_role ? (r.judged_role === "lead" ? "L" : "F") + ": " : ""}Call back ${r.callback_count ?? "—"} + ${r.alternate_count} alt`
        )
        .join(" · ")
    : "Relative placement";

  const defaultCallbacks = Math.max(1, Math.min(entryCount, Math.floor(entryCount * 0.67)));

  return (
    <div
      className={
        "rounded-xl border p-3 " +
        (skipped
          ? "border-dashed border-neutral-700 bg-neutral-900/30"
          : "border-neutral-700 bg-neutral-800/40")
      }
    >
      <button
        onClick={onToggleExpand}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <span className="font-semibold text-white">{getSlotLabel(roundType)}</span>
          {skipped ? (
            <span className="ml-2 text-xs text-neutral-500">Not used</span>
          ) : (
            <span className="ml-2 text-xs text-neutral-500">{configSummary}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {slotStatus && (
            <span
              className={
                "rounded px-2 py-0.5 text-xs font-semibold " +
                (STATUS_STYLE[slotStatus] ?? "bg-neutral-700/60 text-neutral-300")
              }
            >
              {slotStatus === "active" ? "in progress" : slotStatus}
            </span>
          )}
          <span className="text-neutral-500">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {skipped ? (
            isJnJ && isCallback ? (
              <div>
                <div className="mb-2 flex gap-1 overflow-x-auto rounded-lg border border-neutral-700 p-0.5">
                  {(["lead", "follow"] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => setJnjTab(role)}
                      className={
                        "min-w-[7rem] flex-1 rounded-md px-3 py-1.5 text-sm font-medium " +
                        (jnjTab === role ? compBtnTabActive : "text-neutral-400")
                      }
                    >
                      {role === "lead" ? "Leads" : "Follows"}
                    </button>
                  ))}
                </div>
                <EnableForm
                  competitionId={competitionId}
                  roundType={roundType}
                  judgedRole={jnjTab}
                  isCallback
                  defaultCallbacks={defaultCallbacks}
                  defaultAlternates={2}
                  onEnabled={onChanged}
                  onError={onError}
                />
              </div>
            ) : (
              <EnableForm
                competitionId={competitionId}
                roundType={roundType}
                judgedRole={null}
                isCallback={isCallback}
                defaultCallbacks={defaultCallbacks}
                defaultAlternates={2}
                onEnabled={onChanged}
                onError={onError}
              />
            )
          ) : isJnJ && isCallback ? (
            <div>
              <div className="mb-2 flex gap-1 overflow-x-auto rounded-lg border border-neutral-700 p-0.5">
                {(["lead", "follow"] as const).map((role) => {
                  const r = slotRounds.find((x) => x.judged_role === role);
                  return (
                    <button
                      key={role}
                      onClick={() => setJnjTab(role)}
                      className={
                        "min-w-[7rem] flex-1 rounded-md px-3 py-1.5 text-sm font-medium " +
                        (jnjTab === role ? compBtnTabActive : "text-neutral-400")
                      }
                    >
                      {role === "lead" ? "Leads" : "Follows"}
                      {r && (
                        <span className="ml-1 text-xs opacity-70">{r.status}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {(() => {
                const r = slotRounds.find((x) => x.judged_role === jnjTab);
                if (!r) {
                  return (
                    <EnableForm
                      competitionId={competitionId}
                      roundType={roundType}
                      judgedRole={jnjTab}
                      isCallback
                      defaultCallbacks={defaultCallbacks}
                      defaultAlternates={2}
                      onEnabled={onChanged}
                      onError={onError}
                    />
                  );
                }
                return (
                  <SlotRoundPanel
                    round={r}
                    onChanged={onChanged}
                    onDisable={() => disableRound(r)}
                  />
                );
              })()}
            </div>
          ) : (
            <SlotRoundPanel
              round={slotRounds[0]}
              onChanged={onChanged}
              onDisable={() => disableRound(slotRounds[0])}
            />
          )}
        </div>
      )}
    </div>
  );
}
