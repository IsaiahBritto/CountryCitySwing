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

function cleanOrdinals(
  judgeCount: number,
  activeSlots: EntrySlot[],
  activeCount: number
): JudgeOrdinalSheet[] {
  return Array.from({ length: judgeCount }, () => {
    const sheet: JudgeOrdinalSheet = {};
    activeSlots.forEach((slot, i) => {
      sheet[slot] = Math.min(i + 1, activeCount);
    });
    return sheet;
  });
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
    case "jnj_scope_smoke":
      return {
        judgeOrdinals: cleanOrdinals(judgeCount, slots, activeCount),
      };
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
