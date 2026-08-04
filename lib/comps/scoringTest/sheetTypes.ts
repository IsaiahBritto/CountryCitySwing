import type { CallbackValue } from "@/lib/comps/types";

/** Bib-ordered slot label (A, B, … Z, AA, …). */
export type EntrySlot = string;

export type JudgeVoteSheet = Partial<Record<EntrySlot, CallbackValue>>;
export type JudgeOrdinalSheet = Partial<Record<EntrySlot, number>>;
