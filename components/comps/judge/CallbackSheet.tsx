"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { useAutosaveQueue } from "@/components/comps/judge/useAutosaveQueue";

type Vote = "yes" | "alt1" | "alt2" | "alt3" | "no";

interface SheetEntry {
  roundEntryId: string;
  bibNumber: number | null;
  displayName: string;
  heatNumber: number | null;
}

export default function CallbackSheet({
  roundId,
  judgeAssignmentId,
  isOverride,
  callbackCount,
  alternateCount,
  entries,
  initialScores,
  sheetStatus,
  onSubmitted,
}: {
  roundId: string;
  judgeAssignmentId: string;
  isOverride: boolean;
  callbackCount: number;
  alternateCount: number;
  entries: SheetEntry[];
  initialScores: { round_entry_id: string; callback_value: string | null }[];
  sheetStatus: "draft" | "submitted";
  onSubmitted: () => void;
}) {
  const [votes, setVotes] = useState<Map<string, Vote>>(() => {
    const map = new Map<string, Vote>();
    for (const s of initialScores) {
      if (s.callback_value) map.set(s.round_entry_id, s.callback_value as Vote);
    }
    return map;
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const locked = sheetStatus === "submitted";

  const autosave = useAutosaveQueue({
    roundId,
    judgeAssignmentId,
    sendAssignmentId: isOverride,
  });

  useEffect(() => {
    const restored = autosave.restoreUnsent();
    if (restored.length > 0 && !locked) {
      setVotes((prev) => {
        const next = new Map(prev);
        for (const patch of restored) {
          if (patch.callback_value !== undefined) {
            next.set(patch.round_entry_id, (patch.callback_value ?? "no") as Vote);
          }
        }
        return next;
      });
      setNotice("Draft restored from this device");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveCallbacks = Math.min(callbackCount, entries.length);
  const effectiveAlternates = Math.min(
    alternateCount,
    Math.max(0, entries.length - effectiveCallbacks)
  );
  const altOptions = useMemo(
    () =>
      (["alt1", "alt2", "alt3"] as Vote[]).slice(0, effectiveAlternates),
    [effectiveAlternates]
  );

  const yesCount = [...votes.values()].filter((v) => v === "yes").length;

  const setVote = (roundEntryId: string, vote: Vote) => {
    if (locked) return;
    setError(null);
    setVotes((prev) => {
      const next = new Map(prev);
      const current = next.get(roundEntryId);
      const target = current === vote ? "no" : vote;
      const patches: { round_entry_id: string; callback_value: Vote }[] = [];

      if (target === "yes" && current !== "yes" && yesCount >= effectiveCallbacks) {
        setError(
          `All ${effectiveCallbacks} Yes votes are used — remove one first`
        );
        return prev;
      }
      // Alternate ranks are unique: taking a rank moves it off its holder.
      if (target.startsWith("alt")) {
        for (const [id, v] of next) {
          if (v === target && id !== roundEntryId) {
            next.set(id, "no");
            patches.push({ round_entry_id: id, callback_value: "no" });
          }
        }
      }
      next.set(roundEntryId, target);
      patches.push({ round_entry_id: roundEntryId, callback_value: target });

      const scored = [...next.values()].filter(Boolean).length;
      autosave.queue(patches, { scored, total: entries.length });
      return next;
    });
  };

  const altAssigned = (rank: Vote) =>
    [...votes.values()].some((v) => v === rank);
  const canSubmit =
    yesCount === effectiveCallbacks &&
    altOptions.every((rank) => altAssigned(rank));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    await autosave.flushNow();
    const res = await authedFetch(`/api/judge/rounds/${roundId}/scores`, {
      method: "POST",
      body: JSON.stringify(
        isOverride ? { judge_assignment_id: judgeAssignmentId } : {}
      ),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    autosave.clearDraft();
    onSubmitted();
  };

  const heats = useMemo(() => {
    const map = new Map<number | null, SheetEntry[]>();
    for (const e of entries) {
      const key = e.heatNumber;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  }, [entries]);

  const voteBtn = (active: boolean, tone: string) =>
    `min-w-11 rounded-md px-2.5 py-2 text-sm font-semibold transition ${
      active
        ? tone
        : "border border-neutral-600 text-neutral-400 active:bg-neutral-700"
    } ${locked ? "opacity-60" : ""}`;

  return (
    <div>
      {/* Sticky progress header */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between text-sm">
          <span
            className={
              yesCount === effectiveCallbacks
                ? "font-semibold text-primary"
                : "text-neutral-300"
            }
          >
            Yes: {yesCount}/{effectiveCallbacks}
          </span>
          {altOptions.length > 0 && (
            <span className="text-neutral-300">
              Alts:{" "}
              {altOptions.map((rank) => (
                <span
                  key={rank}
                  className={
                    "ml-1 " +
                    (altAssigned(rank) ? "text-amber-400" : "text-neutral-600")
                  }
                >
                  {rank.toUpperCase()}
                </span>
              ))}
            </span>
          )}
          <span className="text-xs text-neutral-500">
            {autosave.saveState === "saving"
              ? "Saving…"
              : autosave.saveState === "offline"
                ? "Offline — will retry"
                : "Saved"}
          </span>
        </div>
      </div>

      {notice && (
        <div className="mb-3 rounded-md border border-blue-500/40 bg-blue-500/10 p-2 text-sm text-blue-300">
          {notice}
        </div>
      )}
      {(error || autosave.lockedMessage) && (
        <div className="mb-3 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-300">
          {autosave.lockedMessage ?? error}
        </div>
      )}
      {locked && (
        <div className="mb-3 rounded-md border border-green-500/40 bg-green-500/10 p-2 text-sm text-green-300">
          Sheet submitted and locked. Ask the chief judge to unlock it if a
          change is needed.
        </div>
      )}

      {heats.map(([heatNumber, heatEntries]) => (
        <div key={heatNumber ?? "all"} className="mb-6">
          {heatNumber != null && (
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Heat {heatNumber}
            </h3>
          )}
          <div className="space-y-2">
            {heatEntries.map((e) => {
              const vote = votes.get(e.roundEntryId);
              const rowTone =
                vote === "yes"
                  ? "border-green-500/60 bg-green-500/10"
                  : vote === "no"
                    ? "border-red-500/60 bg-red-500/10"
                    : vote?.startsWith("alt")
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-neutral-700 bg-neutral-800/50";
              return (
                <div
                  key={e.roundEntryId}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${rowTone}`}
                >
                  <div className="w-14 text-center">
                    <div className="text-xl font-bold text-white">
                      {e.bibNumber ?? "—"}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-neutral-300">
                      {e.displayName}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setVote(e.roundEntryId, "yes")}
                      disabled={locked}
                      className={voteBtn(vote === "yes", "bg-primary text-black")}
                    >
                      Yes
                    </button>
                    {altOptions.map((rank) => (
                      <button
                        key={rank}
                        onClick={() => setVote(e.roundEntryId, rank)}
                        disabled={locked}
                        className={voteBtn(
                          vote === rank,
                          "bg-amber-500 text-black"
                        )}
                      >
                        {rank.replace("alt", "A")}
                      </button>
                    ))}
                    <button
                      onClick={() => setVote(e.roundEntryId, "no")}
                      disabled={locked}
                      className={voteBtn(
                        vote === "no",
                        "bg-red-600 text-white"
                      )}
                    >
                      No
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!locked && (
        <button
          onClick={submit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-xl bg-primary py-3 text-base font-semibold text-black disabled:opacity-40"
        >
          {submitting
            ? "Submitting…"
            : canSubmit
              ? "Submit sheet"
              : yesCount !== effectiveCallbacks
                ? `Select ${effectiveCallbacks - yesCount} more Yes`
                : "Assign all alternate ranks to submit"}
        </button>
      )}
    </div>
  );
}
