/**
 * Bidirectional sync between callback votes (Yes / A1–A3 / No) and raw scores
 * in non-finals judging UI.
 *
 * Raw scores seed from explicit placement votes only when entering Raw mode
 * (unscored competitors stay null). Editing a raw score re-sorts and reassigns
 * callback votes by rank among scored competitors only (top N → Yes, next M →
 * alternates, rest → No). Judge-entered raw values are preserved. Placements
 * ties inherit existing group raw scores (duplicate alts, yes overflow). Alts
 * use preset 60/59/58 unless lowest Yes raw is below 60, then minYes−rank.
 */

import type { CallbackValue } from "@/lib/comps/types";
import { clampScore, roundScore } from "@/lib/scoring/finalsSync";

export type CallbackVote = CallbackValue;

export const YES_CEILING = 100;
export const YES_FLOOR = 51;
export const NO_FLOOR = 1;
export const NO_CEILING = 30;
export const ALT_CEILING = 60;

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

/** Sequential Yes raw: 100, 99, … while above 51; compressed spread when needed. */
export function yesPlacementRaw(
  existingYesCount: number,
  callbackCount: number
): number {
  if (callbackCount <= 0) return YES_CEILING;
  if (callbackCount === 1) return YES_CEILING;

  const simple = YES_CEILING - existingYesCount;
  const useCompressed =
    callbackCount > 50 || simple <= YES_FLOOR;

  if (!useCompressed) {
    return clampScore(simple);
  }

  const step = (YES_CEILING - YES_FLOOR) / (callbackCount - 1);
  return clampScore(YES_CEILING - existingYesCount * step);
}

/** Sequential No raw: 1, 2, 3… capped at 30; compressed spread when needed. */
export function noPlacementRaw(
  existingNoIndex: number,
  noCount = existingNoIndex + 1
): number {
  if (noCount <= 0) return NO_FLOOR;
  if (noCount === 1) return NO_FLOOR;

  const simple = existingNoIndex + 1;
  const useCompressed = noCount > 30 || simple > NO_CEILING;

  if (!useCompressed) {
    return clampScore(simple);
  }

  const step = (NO_CEILING - NO_FLOOR) / (noCount - 1);
  return clampScore(NO_FLOOR + existingNoIndex * step);
}

export function minYesRaw(
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>,
  excludeEntryId?: string
): number | null {
  let min: number | null = null;
  for (const [id, vote] of votes) {
    if (vote !== "yes" || id === excludeEntryId) continue;
    const raw = rawById.get(id);
    if (raw != null) min = min == null ? raw : Math.min(min, raw);
  }
  return min;
}

export function maxExistingNoRaw(
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>,
  excludeEntryId?: string
): number | null {
  let max: number | null = null;
  for (const [id, vote] of votes) {
    if (vote !== "no" || id === excludeEntryId) continue;
    const raw = rawById.get(id);
    if (raw != null) max = max == null ? raw : Math.max(max, raw);
  }
  return max;
}

function altIndexFromVote(vote: CallbackVote): number {
  if (vote === "alt1") return 1;
  if (vote === "alt2") return 2;
  if (vote === "alt3") return 3;
  return 1;
}

export function altPlacementRaw(
  vote: CallbackVote,
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>,
  entryId: string,
  options?: { skipDuplicateMatch?: boolean }
): number {
  if (!options?.skipDuplicateMatch) {
    const existingHolders = [...votes.entries()]
      .filter(([id, v]) => v === vote && id !== entryId)
      .map(([id]) => id);
    for (const holderId of existingHolders) {
      const holderRaw = rawById.get(holderId);
      if (holderRaw != null) return holderRaw;
    }
  }

  const altIndex = altIndexFromVote(vote);
  const minYes = minYesRaw(votes, rawById, entryId);

  let computed: number;
  if (minYes == null || minYes >= ALT_CEILING) {
    computed = ALT_CEILING - (altIndex - 1);
  } else {
    computed = minYes - altIndex;
  }

  const maxNo = maxExistingNoRaw(votes, rawById, entryId);
  if (maxNo != null) {
    computed = Math.max(computed, roundScore(maxNo + 1));
  }

  return clampScore(computed);
}

/** Raw score when assigning a vote in Placements mode (spread + intentional ties). */
export function rawScoreForPlacementVote(
  vote: CallbackVote,
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>,
  limits: CallbackLimits,
  entryId: string
): number {
  if (vote === "yes") {
    const existingYesCount = [...votes.entries()].filter(
      ([id, v]) => v === "yes" && id !== entryId
    ).length;
    if (existingYesCount < limits.callbackCount) {
      return yesPlacementRaw(existingYesCount, limits.callbackCount);
    }
    const yesRaws = [...votes.entries()]
      .filter(([id, v]) => v === "yes" && id !== entryId)
      .map(([id]) => rawById.get(id))
      .filter((r): r is number => r != null);
    return yesRaws.length > 0
      ? clampScore(Math.min(...yesRaws))
      : yesPlacementRaw(existingYesCount, limits.callbackCount);
  }

  if (vote.startsWith("alt")) {
    return altPlacementRaw(vote, votes, rawById, entryId);
  }

  const existingNoCount = [...votes.entries()].filter(
    ([id, v]) => v === "no" && id !== entryId
  ).length;
  return noPlacementRaw(existingNoCount, existingNoCount + 1);
}

function sortEntryIdsByRaw(
  ids: string[],
  rawById: Map<string, number | null>,
  direction: "desc" | "asc"
): string[] {
  return [...ids].sort((a, b) => {
    const ra = rawById.get(a);
    const rb = rawById.get(b);
    const fa =
      ra ??
      (direction === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
    const fb =
      rb ??
      (direction === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
    if (fa !== fb) return direction === "desc" ? fb - fa : fa - fb;
    return a.localeCompare(b);
  });
}

/** First spread candidate not blocked or already assigned in this re-pack pass. */
export function nextSpreadSlot(
  candidates: number[],
  blocked: Set<number>,
  assigned: Set<number>
): number | null {
  for (const value of candidates) {
    if (!blocked.has(value) && !assigned.has(value)) return value;
  }
  for (let value = YES_CEILING; value >= YES_FLOOR; value -= 1) {
    const rounded = clampScore(value);
    if (!blocked.has(rounded) && !assigned.has(rounded)) return rounded;
  }
  return null;
}

/**
 * Reassigns spread raws within Yes / Alt / No bands. Manual rows (not in
 * automatedEntryIds) keep their raw; automated rows fill dense sequences
 * around blocked manual values.
 */
export function repackPlacementRaws(
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>,
  limits: CallbackLimits,
  automatedEntryIds: Set<string>
): Map<string, number | null> {
  const out = new Map(rawById);
  const blocked = new Set<number>();
  const assigned = new Set<number>();

  for (const [id] of votes) {
    if (automatedEntryIds.has(id)) continue;
    const raw = rawById.get(id);
    if (raw == null) continue;
    out.set(id, raw);
    blocked.add(raw);
    assigned.add(raw);
  }

  const yesIds = [...votes.entries()]
    .filter(([, vote]) => vote === "yes")
    .map(([id]) => id);
  const yesSorted = sortEntryIdsByRaw(yesIds, rawById, "desc");
  const inQuotaYes = yesSorted.slice(0, limits.callbackCount);
  const overflowYes = yesSorted.slice(limits.callbackCount);

  const yesCandidates = Array.from({ length: limits.callbackCount }, (_, index) =>
    yesPlacementRaw(index, limits.callbackCount)
  );

  for (const id of inQuotaYes) {
    if (!automatedEntryIds.has(id)) continue;
    const raw = nextSpreadSlot(yesCandidates, blocked, assigned);
    if (raw != null) {
      out.set(id, raw);
      assigned.add(raw);
    }
  }

  const inQuotaRaws = inQuotaYes
    .map((id) => out.get(id))
    .filter((raw): raw is number => raw != null);
  const overflowRaw =
    inQuotaRaws.length > 0
      ? clampScore(Math.min(...inQuotaRaws))
      : yesPlacementRaw(0, limits.callbackCount);

  for (const id of overflowYes) {
    if (!automatedEntryIds.has(id)) continue;
    out.set(id, overflowRaw);
  }

  for (let rankIndex = 1; rankIndex <= limits.alternateCount; rankIndex++) {
    const rank = `alt${rankIndex}` as CallbackVote;
    const holders = [...votes.entries()]
      .filter(([, vote]) => vote === rank)
      .map(([id]) => id);
    if (holders.length === 0) continue;

    const sorted = sortEntryIdsByRaw(holders, out, "desc");
    const manualHolders = sorted.filter((id) => !automatedEntryIds.has(id));
    const automatedHolders = sorted.filter((id) => automatedEntryIds.has(id));

    let groupRaw: number | null = null;
    if (manualHolders.length > 0) {
      groupRaw = out.get(manualHolders[0]) ?? null;
    } else if (automatedHolders.length > 0) {
      groupRaw = altPlacementRaw(rank, votes, out, automatedHolders[0], {
        skipDuplicateMatch: true,
      });
    }

    if (groupRaw != null) {
      for (const id of automatedHolders) {
        out.set(id, groupRaw);
      }
    }
  }

  const noIds = [...votes.entries()]
    .filter(([, vote]) => vote === "no")
    .map(([id]) => id);
  const noSorted = sortEntryIdsByRaw(noIds, rawById, "asc");
  const noCount = noIds.length;
  const noCandidates = Array.from({ length: noCount }, (_, index) =>
    noPlacementRaw(index, noCount)
  );

  let noSlot = 0;
  for (const id of noSorted) {
    if (!automatedEntryIds.has(id)) continue;
    let raw = noCandidates[noSlot] ?? noPlacementRaw(noSlot, noCount);
    while (blocked.has(raw) || assigned.has(raw)) {
      noSlot += 1;
      raw = noCandidates[noSlot] ?? noPlacementRaw(noSlot, noCount);
    }
    out.set(id, raw);
    assigned.add(raw);
    noSlot += 1;
  }

  return out;
}

/** Rank-based callback assignment from raw scores (descending). Only competitors with a non-null raw score are ranked; unscored entries are omitted from the result. Tied raw scores receive the same vote (one rank slot per score group). */
export function callbacksFromRawOrder(
  entryIds: string[],
  rawById: Map<string, number | null>,
  limits: CallbackLimits
): Map<string, CallbackVote> {
  const { callbackCount, alternateCount } = limits;
  const scoredIds = entryIds.filter((id) => rawById.get(id) != null);

  const groups: { raw: number; ids: string[] }[] = [];
  const rawsDesc = [
    ...new Set(scoredIds.map((id) => rawById.get(id)!)),
  ].sort((a, b) => b - a);
  for (const raw of rawsDesc) {
    const ids = scoredIds
      .filter((id) => rawById.get(id) === raw)
      .sort((a, b) => a.localeCompare(b));
    groups.push({ raw, ids });
  }

  const out = new Map<string, CallbackVote>();
  let slot = 0;
  for (const group of groups) {
    const vote = voteForRankSlot(slot, callbackCount, alternateCount);
    for (const id of group.ids) {
      out.set(id, vote);
    }
    slot += 1;
  }
  return out;
}

function voteForRankSlot(
  slot: number,
  callbackCount: number,
  alternateCount: number
): CallbackVote {
  if (slot < callbackCount) return "yes";
  if (slot < callbackCount + alternateCount) {
    return `alt${slot - callbackCount + 1}` as CallbackVote;
  }
  return "no";
}

/** Entry ids with duplicate non-null raw scores (must be resolved before submit). */
export function callbackRawTiedEntryIds(
  rawById: Map<string, number | null>
): string[] {
  const byRaw = new Map<number, string[]>();
  for (const [id, raw] of rawById) {
    if (raw == null) continue;
    byRaw.set(raw, [...(byRaw.get(raw) ?? []), id]);
  }
  const tied: string[] = [];
  for (const group of byRaw.values()) {
    if (group.length > 1) tied.push(...group);
  }
  return tied;
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

/** Seeds spread raw scores via full re-pack (all voted entries automated). */
export function seedRawFromCallbacks(
  entryIds: string[],
  votes: Map<string, CallbackVote>,
  limits: CallbackLimits
): Map<string, number> {
  void entryIds;
  const automated = new Set(votes.keys());
  const seedRaw = new Map<string, number | null>();
  for (const id of votes.keys()) seedRaw.set(id, null);

  const repacked = repackPlacementRaws(votes, seedRaw, limits, automated);
  const out = new Map<string, number>();
  for (const [id, raw] of repacked) {
    if (votes.has(id) && raw != null) out.set(id, raw);
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
  _votes: Map<string, CallbackVote>,
  _limits: CallbackLimits,
  rawById?: Map<string, number | null>
): string[] {
  return rawById ? callbackRawTiedEntryIds(rawById) : [];
}

/** Submit gate: every entry voted, exact quotas, no vote-level or raw-score ties. */
export function canSubmitCallbackPlacements(
  votes: Map<string, CallbackVote>,
  limits: CallbackLimits,
  entryIds: string[] = [],
  rawById?: Map<string, number | null>
): boolean {
  if (entryIds.length > 0 && entryIds.some((id) => !votes.has(id))) {
    return false;
  }
  if (rawById && callbackRawTiedEntryIds(rawById).length > 0) return false;
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
 * callbackPlacementConflicts for submit validation (not tie UI).
 */
export function applyCallbackVote(
  entryIds: string[],
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>,
  entryId: string,
  vote: CallbackVote,
  limits: CallbackLimits,
  automatedEntryIds?: Set<string>
): { votes: Map<string, CallbackVote>; rawById: Map<string, number | null> } {
  void entryIds;
  const current = votes.get(entryId);
  if (current === vote) {
    return { votes, rawById };
  }

  const nextVotes = new Map(votes);
  nextVotes.set(entryId, vote);

  const automated = automatedEntryIds ?? new Set(nextVotes.keys());
  const nextRaw = repackPlacementRaws(nextVotes, rawById, limits, automated);

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

  const scoredIds = entryIds.filter((id) => nextRaw.get(id) != null);
  const nextVotes = callbacksFromRawOrder(scoredIds, nextRaw, limits);
  return { votes: nextVotes, rawById: nextRaw };
}
