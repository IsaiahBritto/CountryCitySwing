export interface ScenarioResult {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  error?: string;
}

export interface CompRunResult {
  competitionId: string;
  competitionName: string;
  scenarios: ScenarioResult[];
}

export interface ScoringTestReport {
  ok: boolean;
  dryRun: boolean;
  durationMs: number;
  strictly: CompRunResult | null;
  jnj: CompRunResult | null;
  errors: string[];
}

/** @deprecated Use EntrySlot from sheetTypes for new code. */
export type ScenarioSlot = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type EntrySlot = string;

export interface SlotMap {
  bySlot: Map<EntrySlot, string>;
  slots: EntrySlot[];
}

/** A → 0, B → 1, … Z → 25, AA → 26 */
export function slotAtIndex(index: number): EntrySlot {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}
