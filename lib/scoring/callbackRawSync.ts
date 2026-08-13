/**
 * Bidirectional sync between callback votes (Yes / A1–A3 / No) and raw scores
 * in non-finals judging UI.
 *
 * Raw scores seed from discrete votes when entering Raw mode. Editing a raw
 * score re-sorts and reassigns callback votes by rank (top N → Yes, next M →
 * alternates, rest → No). Judge-entered raw values are preserved.
 */

import type { CallbackValue } from "@/lib/comps/types";
import { clampScore } from "@/lib/scoring/finalsSync";

export type CallbackVote = CallbackValue;

export const CALLBACK_RAW_SCORES: Record<CallbackVote, number> = {
  yes: 100,
  alt1: 75,
  alt2: 65,
  alt3: 55,
  no: 20,
};

export interface CallbackScoreItem {
  entryId: string;
  vote: CallbackVote;
  raw: number | null;
}

export interface CallbackLimits {
  callbackCount: number;
  alternateCount: number;
}

export type CallbackPlacementConflict =
  | { type: "yes_overflow"; entryIds: string[] }
  | { type: "alt_duplicate"; rank: CallbackVote; entryIds: string[] };

export function rawScoreForCallback(vote: CallbackVote): number {
  return CALLBACK_RAW_SCORES[vote];
}

/** Rank-based callback assignment from raw scores (descending). */
export function callbacksFromRawOrder(
  entryIds: string[],
  rawById: Map<string, number | null>,
  limits: CallbackLimits
): Map<string, CallbackVote> {
  const { callbackCount, alternateCount } = limits;
  const sorted = [...entryIds].sort((a, b) => {
    const aRaw = rawById.get(a) ?? -1;
    const bRaw = rawById.get(b) ?? -1;
    if (aRaw !== bRaw) return bRaw - aRaw;
    return a.localeCompare(b);
  });

  const out = new Map<string, CallbackVote>();
  for (let i = 0; i < sorted.length; i++) {
    if (i < callbackCount) {
      out.set(sorted[i], "yes");
    } else if (i < callbackCount + alternateCount) {
      const altIndex = i - callbackCount + 1;
      out.set(sorted[i], `alt${altIndex}` as CallbackVote);
    } else {
      out.set(sorted[i], "no");
    }
  }
  return out;
}

export function itemsFromVotesAndRaw(
  entryIds: string[],
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>
): CallbackScoreItem[] {
  return entryIds.map((entryId) => ({
    entryId,
    vote: votes.get(entryId) ?? "no",
    raw: rawById.get(entryId) ?? null,
  }));
}

export function seedRawFromCallbacks(
  entryIds: string[],
  votes: Map<string, CallbackVote>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of entryIds) {
    const vote = votes.get(id) ?? "no";
    out.set(id, rawScoreForCallback(vote));
  }
  return out;
}

/** Vote-level conflicts from overlapping Placements assignments. */
export function callbackPlacementConflicts(
  votes: Map<string, CallbackVote>,
  limits: CallbackLimits
): CallbackPlacementConflict[] {
  const conflicts: CallbackPlacementConflict[] = [];
  const yesIds = [...votes.entries()]
    .filter(([, v]) => v === "yes")
    .map(([id]) => id);
  if (yesIds.length > limits.callbackCount) {
    conflicts.push({ type: "yes_overflow", entryIds: yesIds });
  }
  for (let i = 1; i <= limits.alternateCount; i++) {
    const rank = `alt${i}` as CallbackVote;
    const holders = [...votes.entries()]
      .filter(([, v]) => v === rank)
      .map(([id]) => id);
    if (holders.length > 1) {
      conflicts.push({ type: "alt_duplicate", rank, entryIds: holders });
    }
  }
  return conflicts;
}

export function conflictedCallbackEntryIds(
  votes: Map<string, CallbackVote>,
  limits: CallbackLimits
): string[] {
  const ids = new Set<string>();
  for (const conflict of callbackPlacementConflicts(votes, limits)) {
    for (const id of conflict.entryIds) ids.add(id);
  }
  return [...ids];
}

/** Submit gate: every entry voted, exact quotas, no vote-level ties. */
export function canSubmitCallbackPlacements(
  votes: Map<string, CallbackVote>,
  limits: CallbackLimits,
  entryIds: string[] = []
): boolean {
  if (entryIds.length > 0 && entryIds.some((id) => !votes.has(id))) {
    return false;
  }
  if (callbackPlacementConflicts(votes, limits).length > 0) return false;
  const yesCount = [...votes.values()].filter((v) => v === "yes").length;
  if (yesCount !== limits.callbackCount) return false;
  for (let i = 1; i <= limits.alternateCount; i++) {
    const rank = `alt${i}` as CallbackVote;
    if (![...votes.values()].some((v) => v === rank)) return false;
  }
  return true;
}

/**
 * Applies a callback vote in Placements mode. Overlaps are allowed; use
 * callbackPlacementConflicts to detect ties.
 */
export function applyCallbackVote(
  entryIds: string[],
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>,
  entryId: string,
  vote: CallbackVote,
  _limits: CallbackLimits
): { votes: Map<string, CallbackVote>; rawById: Map<string, number | null> } {
  void entryIds;
  const current = votes.get(entryId);
  if (current === vote) {
    return { votes, rawById };
  }

  const nextVotes = new Map(votes);
  const nextRaw = new Map(rawById);
  nextVotes.set(entryId, vote);
  nextRaw.set(entryId, rawScoreForCallback(vote));

  return { votes: nextVotes, rawById: nextRaw };
}

/**
 * Applies a raw-score edit and reassigns callback votes by rank. Preserves the
 * edited entry's raw value; other entries keep their existing raw scores.
 */
export function applyRawChangeForCallback(
  entryIds: string[],
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>,
  entryId: string,
  newRaw: number,
  limits: CallbackLimits
): { votes: Map<string, CallbackVote>; rawById: Map<string, number | null> } {
  void votes;
  const nextRaw = new Map(rawById);
  nextRaw.set(entryId, clampScore(newRaw));

  const nextVotes = callbacksFromRawOrder(entryIds, nextRaw, limits);
  return { votes: nextVotes, rawById: nextRaw };
}
