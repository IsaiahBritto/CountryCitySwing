import { tabulateRelativePlacement } from "@/lib/scoring/relativePlacement";
import type { EdgeCaseType } from "../playbook";
import type { EntrySlot, JudgeOrdinalSheet } from "../sheetTypes";
import { slotAtIndex } from "../types";

export interface OrdinalGeneratorParams {
  edgeCase: EdgeCaseType;
  entryCount: number;
  judgeCount: number;
  slots?: EntrySlot[];
}

export interface OrdinalGeneratorResult {
  judgeOrdinals: JudgeOrdinalSheet[];
  cjOrdinals?: Partial<Record<EntrySlot, number>>;
}

function slotsForCount(entryCount: number, provided?: EntrySlot[]): EntrySlot[] {
  if (provided && provided.length >= entryCount) {
    return provided.slice(0, entryCount);
  }
  return Array.from({ length: entryCount }, (_, i) => slotAtIndex(i));
}

const HEAD_TO_HEAD_PANEL: JudgeOrdinalSheet[] = [
  { A: 1, B: 2, C: 3 },
  { A: 2, B: 1, C: 3 },
  { A: 1, B: 3, C: 2 },
  { A: 2, B: 1, C: 3 },
  { A: 3, B: 2, C: 1 },
];

const CYCLE_PANEL: JudgeOrdinalSheet[] = [
  { A: 1, B: 2, C: 3 },
  { B: 1, C: 2, A: 3 },
  { C: 1, A: 2, B: 3 },
  { A: 1, B: 2, C: 3 },
  { B: 1, C: 2, A: 3 },
];

const CJ_CYCLE_BREAK: Partial<Record<EntrySlot, number>> = {
  B: 1,
  A: 2,
  C: 3,
};

function expandPanelPattern(
  pattern: JudgeOrdinalSheet[],
  judgeCount: number,
  activeSlots: EntrySlot[],
  _activeCount: number
): JudgeOrdinalSheet[] {
  return Array.from({ length: judgeCount }, (_, j) => {
    const template = pattern[j % pattern.length];
    const sheet: JudgeOrdinalSheet = {};
    const used = new Set<number>();
    for (const slot of activeSlots) {
      const ord = template[slot];
      if (ord != null) {
        sheet[slot] = ord;
        used.add(ord);
      }
    }
    let next = 1;
    for (const slot of activeSlots) {
      if (sheet[slot] != null) continue;
      while (used.has(next)) next++;
      sheet[slot] = next;
      used.add(next);
      next++;
    }
    return sheet;
  });
}

function expandCjOrdinals(
  template: Partial<Record<EntrySlot, number>>,
  activeSlots: EntrySlot[]
): Partial<Record<EntrySlot, number>> {
  const sheet: Partial<Record<EntrySlot, number>> = {};
  const used = new Set<number>();
  for (const slot of activeSlots) {
    const ord = template[slot];
    if (ord != null) {
      sheet[slot] = ord;
      used.add(ord);
    }
  }
  let next = 1;
  for (const slot of activeSlots) {
    if (sheet[slot] != null) continue;
    while (used.has(next)) next++;
    sheet[slot] = next;
    used.add(next);
    next++;
  }
  return sheet;
}

/** No more than `maxSame` judges may assign the same ordinal to one entry. */
export function assertMaxSamePlacement(
  judgeOrdinals: JudgeOrdinalSheet[],
  slots: EntrySlot[],
  maxSame = 3
) {
  for (const slot of slots) {
    const counts = new Map<number, number>();
    for (const sheet of judgeOrdinals) {
      const ord = sheet[slot];
      if (ord == null) {
        throw new Error(`Missing ordinal for slot ${slot}`);
      }
      counts.set(ord, (counts.get(ord) ?? 0) + 1);
    }
    for (const [ord, count] of counts) {
      if (count > maxSame) {
        throw new Error(
          `${count} judges assigned ${ord} to ${slot} (max ${maxSame})`
        );
      }
    }
  }
}

function orderToSheet(
  order: number[],
  activeSlots: EntrySlot[]
): JudgeOrdinalSheet {
  const sheet: JudgeOrdinalSheet = {};
  order.forEach((slotIdx, rank) => {
    sheet[activeSlots[slotIdx]] = rank + 1;
  });
  return sheet;
}

function patternEntryRank(entryIdx: number, rank: number, n: number): number[] {
  const others = Array.from({ length: n }, (_, i) => i).filter(
    (i) => i !== entryIdx
  );
  const order: number[] = [];
  let oIdx = 0;
  for (let pos = 0; pos < n; pos++) {
    if (pos === rank - 1) order.push(entryIdx);
    else order.push(others[oIdx++]);
  }
  return order;
}

function buildPatternLibrary(n: number): number[][] {
  if (n <= 1) return [Array.from({ length: n }, (_, i) => i)];

  const seen = new Set<string>();
  const patterns: number[][] = [];
  const add = (order: number[]) => {
    const key = order.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      patterns.push([...order]);
    }
  };

  const identity = Array.from({ length: n }, (_, i) => i);
  add(identity);

  const maxSwaps = Math.min(4, Math.max(2, n - 1));
  let frontier: number[][] = [identity];
  for (let depth = 0; depth < maxSwaps; depth++) {
    const next: number[][] = [];
    for (const order of frontier) {
      for (let p = 0; p < n - 1; p++) {
        const swapped = [...order];
        [swapped[p], swapped[p + 1]] = [swapped[p + 1], swapped[p]];
        if (!seen.has(swapped.join(","))) {
          add(swapped);
          next.push(swapped);
        }
      }
    }
    frontier = next;
  }

  for (let i = 0; i < n; i++) {
    const seed = i + 1;
    for (let rank = Math.max(1, seed - 1); rank <= Math.min(n, seed + 1); rank++) {
      add(patternEntryRank(i, rank, n));
    }
  }

  return patterns;
}

function inversionCount(order: number[]): number {
  let inv = 0;
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      if (order[i] > order[j]) inv++;
    }
  }
  return inv;
}

function tabulatesClean(
  sheets: JudgeOrdinalSheet[],
  activeSlots: EntrySlot[]
): boolean {
  const judgeIds = sheets.map((_, i) => `j${i}`);
  const ordinals: Record<string, Record<string, number>> = {};
  for (let j = 0; j < sheets.length; j++) {
    ordinals[judgeIds[j]] = {};
    for (const slot of activeSlots) {
      ordinals[judgeIds[j]][slot] = sheets[j][slot]!;
    }
  }
  const tab = tabulateRelativePlacement({
    judgeIds,
    entryIds: activeSlots,
    ordinals,
    chiefJudgeOrdinals: null,
  });
  return tab.unresolvedTies.length === 0;
}

function assignVariedSheets(
  judgeIndex: number,
  judgeCount: number,
  sheets: JudgeOrdinalSheet[],
  patterns: number[][],
  activeSlots: EntrySlot[],
  maxSame: number,
  requireCleanTabulation: boolean
): boolean {
  if (judgeIndex === judgeCount) {
    return !requireCleanTabulation || tabulatesClean(sheets, activeSlots);
  }

  for (const pattern of patterns) {
    const candidate = orderToSheet(pattern, activeSlots);
    try {
      assertMaxSamePlacement([...sheets, candidate], activeSlots, maxSame);
    } catch {
      continue;
    }
    sheets.push(candidate);
    if (
      assignVariedSheets(
        judgeIndex + 1,
        judgeCount,
        sheets,
        patterns,
        activeSlots,
        maxSame,
        requireCleanTabulation
      )
    ) {
      return true;
    }
    sheets.pop();
  }
  return false;
}

/** Per-judge permutations close to seed order with small deterministic spread. */
function variedConsensusOrdinals(
  judgeCount: number,
  activeSlots: EntrySlot[],
  maxSame = 3
): JudgeOrdinalSheet[] {
  const n = activeSlots.length;
  if (n === 0) return [];

  const patterns = buildPatternLibrary(n).sort(
    (a, b) => inversionCount(a) - inversionCount(b)
  );
  const sheets: JudgeOrdinalSheet[] = [];
  const ok = assignVariedSheets(
    0,
    judgeCount,
    sheets,
    patterns,
    activeSlots,
    maxSame,
    true
  );
  if (!ok) {
    throw new Error(
      `Could not assign varied ordinals (${judgeCount} judges, ${n} entries, max ${maxSame} same)`
    );
  }
  return sheets;
}

function assertVariedOrdinalSheets(
  judgeOrdinals: JudgeOrdinalSheet[],
  slots: EntrySlot[],
  maxSame = 3
) {
  assertMaxSamePlacement(judgeOrdinals, slots, maxSame);
  if (judgeOrdinals.length > 1) {
    const first = JSON.stringify(judgeOrdinals[0]);
    const allIdentical = judgeOrdinals.every(
      (sheet) => JSON.stringify(sheet) === first
    );
    if (allIdentical) {
      throw new Error("Expected varied ordinals but all judges match");
    }
  }
}

export function generateOrdinalVotes(
  params: OrdinalGeneratorParams
): OrdinalGeneratorResult {
  const { edgeCase, entryCount, judgeCount, slots: providedSlots } = params;
  const slots = slotsForCount(entryCount, providedSlots);
  const activeCount = slots.length;

  switch (edgeCase) {
    case "rp_head_to_head_break":
      return {
        judgeOrdinals: expandPanelPattern(
          HEAD_TO_HEAD_PANEL,
          judgeCount,
          slots,
          activeCount
        ),
      };
    case "rp_cycle_cj_break":
      return {
        judgeOrdinals: expandPanelPattern(
          CYCLE_PANEL,
          judgeCount,
          slots,
          activeCount
        ),
        cjOrdinals: expandCjOrdinals(CJ_CYCLE_BREAK, slots),
      };
    case "rp_clean":
    case "jnj_scope_smoke": {
      const judgeOrdinals = variedConsensusOrdinals(judgeCount, slots);
      assertVariedOrdinalSheets(judgeOrdinals, slots);
      return { judgeOrdinals };
    }
    default:
      throw new Error(`Not an ordinal edge case: ${edgeCase}`);
  }
}

export function expectOrdinalTabulation(
  result: OrdinalGeneratorResult,
  slots: EntrySlot[],
  expectUnresolved: boolean
) {
  const judgeIds = result.judgeOrdinals.map((_, i) => `j${i}`);
  const entryIds = slots;
  const ordinals: Record<string, Record<string, number>> = {};
  for (let j = 0; j < result.judgeOrdinals.length; j++) {
    ordinals[judgeIds[j]] = {};
    for (const slot of slots) {
      ordinals[judgeIds[j]][slot] = result.judgeOrdinals[j][slot]!;
    }
  }
  const cjOrdinals: Record<string, number> = {};
  if (result.cjOrdinals) {
    for (const slot of slots) {
      cjOrdinals[slot] = result.cjOrdinals[slot]!;
    }
  }
  const tab = tabulateRelativePlacement({
    judgeIds,
    entryIds,
    ordinals,
    chiefJudgeOrdinals: Object.keys(cjOrdinals).length ? cjOrdinals : null,
  });
  if (expectUnresolved) {
    if (tab.unresolvedTies.length === 0) {
      throw new Error("Expected unresolved RP ties");
    }
  } else if (tab.unresolvedTies.length > 0) {
    throw new Error(
      `Expected clean RP tabulation but got: ${JSON.stringify(tab.unresolvedTies)}`
    );
  }
  return tab;
}
