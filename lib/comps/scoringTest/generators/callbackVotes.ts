import type { CallbackValue } from "@/lib/comps/types";
import { scoreCallbacks } from "@/lib/scoring/callbacks";
import type { EdgeCaseType } from "../playbook";
import type { EntrySlot, JudgeVoteSheet } from "../sheetTypes";
import { slotAtIndex } from "../types";

export interface CallbackGeneratorParams {
  edgeCase: EdgeCaseType;
  callbackCount: number;
  alternateCount: number;
  entryCount: number;
  judgeCount: number;
  slots?: EntrySlot[];
}

export interface CallbackGeneratorResult {
  panelSheets: JudgeVoteSheet[];
  cjSheet: JudgeVoteSheet;
}

const ALT_RANKS: CallbackValue[] = ["alt1", "alt2", "alt3"];

function slotsForCount(entryCount: number, provided?: EntrySlot[]): EntrySlot[] {
  if (provided && provided.length >= entryCount) {
    return provided.slice(0, entryCount);
  }
  return Array.from({ length: entryCount }, (_, i) => slotAtIndex(i));
}

function emptySheets(judgeCount: number, slots: EntrySlot[]): JudgeVoteSheet[] {
  return Array.from({ length: judgeCount }, () => {
    const sheet: JudgeVoteSheet = {};
    for (const s of slots) sheet[s] = "no";
    return sheet;
  });
}

function emptySheet(slots: EntrySlot[]): JudgeVoteSheet {
  const sheet: JudgeVoteSheet = {};
  for (const s of slots) sheet[s] = "no";
  return sheet;
}

/** Distribute remaining yes/alt votes on tail slots so each judge meets quotas. */
function fillJudgeQuotas(
  sheets: JudgeVoteSheet[],
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number,
  skipSlots: Set<EntrySlot>,
  skipPerJudge?: Set<EntrySlot>[]
) {
  for (let j = 0; j < sheets.length; j++) {
    const sheet = sheets[j];
    const skip = skipPerJudge?.[j] ?? skipSlots;
    const tail = slots.filter((s) => !skip.has(s));
    let yesCount = slots.filter((s) => sheet[s] === "yes").length;
    let altIdx = 0;
    for (const s of slots) {
      if (sheet[s]?.startsWith("alt")) altIdx++;
    }

    for (const s of tail) {
      if (yesCount < callbackCount && sheet[s] === "no") {
        sheet[s] = "yes";
        yesCount++;
      }
    }

    for (const s of tail) {
      if (altIdx < alternateCount && sheet[s] === "no") {
        sheet[s] = ALT_RANKS[Math.min(altIdx, 2)];
        altIdx++;
      }
    }
  }
}

function fillSingleJudgeQuotas(
  sheet: JudgeVoteSheet,
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number,
  skipSlots: Set<EntrySlot>
) {
  fillJudgeQuotas([sheet], slots, callbackCount, alternateCount, skipSlots);
}

function minEntriesForAdvanceBoundaryTie(
  callbackCount: number,
  alternateCount: number
): number {
  return alternateCount > 0
    ? callbackCount + alternateCount + 1
    : callbackCount + 1;
}

/** Assign alt1…altN on slots immediately after the advance-boundary tie pair. */
function assignAdvanceBoundaryAltSlots(
  sheets: JudgeVoteSheet[],
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number,
  perJudgeSkip: Set<EntrySlot>[]
) {
  if (alternateCount === 0) return;

  const pool = slots.slice(callbackCount + 1);
  if (pool.length < alternateCount) {
    throw new Error(
      `advance_boundary_tie needs at least ${callbackCount + alternateCount + 1} entries`
    );
  }

  for (let j = 0; j < sheets.length; j++) {
    for (let a = 0; a < alternateCount; a++) {
      const slot = pool[(j * alternateCount + a) % pool.length];
      perJudgeSkip[j].add(slot);
      sheets[j][slot] = ALT_RANKS[Math.min(a, 2)];
    }
  }
}

function assignAdvanceBoundaryCjAlts(
  sheet: JudgeVoteSheet,
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number,
  skipSlots: Set<EntrySlot>
) {
  if (alternateCount === 0) return;

  const pool = slots.slice(callbackCount + 1);
  if (pool.length < alternateCount) {
    throw new Error(
      `advance_boundary_tie needs at least ${callbackCount + alternateCount + 1} entries`
    );
  }

  for (let a = 0; a < alternateCount; a++) {
    const slot = pool[a];
    skipSlots.add(slot);
    sheet[slot] = ALT_RANKS[Math.min(a, 2)];
  }
}

/** Mirrors judge submit validation in scores/route.ts. */
export function assertCallbackSheetQuotas(
  sheet: JudgeVoteSheet,
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number
) {
  let yes = 0;
  const altRanks = new Map<string, number>();
  for (const slot of slots) {
    const value = sheet[slot] ?? "no";
    if (value === "yes") {
      yes++;
    } else if (value === "alt1" || value === "alt2" || value === "alt3") {
      altRanks.set(value, (altRanks.get(value) ?? 0) + 1);
    } else if (value !== "no") {
      throw new Error(`Invalid callback value ${value} on slot ${slot}`);
    }
  }
  if (yes !== callbackCount) {
    throw new Error(
      `Expected exactly ${callbackCount} Yes votes (got ${yes})`
    );
  }
  const totalAlts = [...altRanks.values()].reduce((a, b) => a + b, 0);
  if (totalAlts !== alternateCount) {
    throw new Error(
      `Expected exactly ${alternateCount} alternate${alternateCount === 1 ? "" : "s"} (got ${totalAlts})`
    );
  }
  for (const [rank, count] of altRanks) {
    if (count > 1) {
      throw new Error(
        `Alternate rank ${rank.replace("alt", "")} is used more than once`
      );
    }
  }
  for (let i = 1; i <= alternateCount; i++) {
    if (!altRanks.has(`alt${i}`)) {
      throw new Error(`Alternate ${i} has not been assigned`);
    }
  }
}

function assertAllSheetsMeetQuotas(
  panelSheets: JudgeVoteSheet[],
  cjSheet: JudgeVoteSheet,
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number
) {
  for (const sheet of panelSheets) {
    assertCallbackSheetQuotas(sheet, slots, callbackCount, alternateCount);
  }
  assertCallbackSheetQuotas(cjSheet, slots, callbackCount, alternateCount);
}

/** Advance-boundary tie between slots K and K+1 (0-indexed K-1 and K). */
function applyAdvanceBoundaryTie(
  sheets: JudgeVoteSheet[],
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number
) {
  const minEntries = minEntriesForAdvanceBoundaryTie(
    callbackCount,
    alternateCount
  );
  const leader = slots[0];
  const tieA = slots[callbackCount - 1];
  const tieB = slots[callbackCount];
  if (!leader || !tieA || !tieB) {
    throw new Error(`advance_boundary_tie needs at least ${minEntries} entries`);
  }
  if (
    alternateCount > 0 &&
    slots.slice(callbackCount + 1).length < alternateCount
  ) {
    throw new Error(`advance_boundary_tie needs at least ${minEntries} entries`);
  }

  for (let j = 0; j < sheets.length; j++) {
    sheets[j][leader] = "yes";
  }

  const patterns: [CallbackValue, CallbackValue][] = [
    ["yes", "no"],
    ["no", "yes"],
    ["no", "no"],
    ["yes", "no"],
    ["no", "yes"],
  ];
  for (let j = 0; j < sheets.length; j++) {
    const [a, b] = patterns[j % patterns.length];
    sheets[j][tieA] = a;
    sheets[j][tieB] = b;
  }

  const baseSkip = new Set<EntrySlot>([leader, tieA, tieB]);
  const perJudgeSkip = sheets.map(() => new Set(baseSkip));
  assignAdvanceBoundaryAltSlots(
    sheets,
    slots,
    callbackCount,
    alternateCount,
    perJudgeSkip
  );
  fillJudgeQuotas(
    sheets,
    slots,
    callbackCount,
    alternateCount,
    baseSkip,
    perJudgeSkip
  );
}

/** Alternate-boundary tie: last alternate rank vs first non-alternate rank. */
function applyAlternateBoundaryTie(
  sheets: JudgeVoteSheet[],
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number
) {
  if (alternateCount < 1) {
    throw new Error("alternate_boundary_tie requires alternateCount >= 1");
  }
  const tieA = slots[callbackCount + alternateCount - 1];
  const tieB = slots[callbackCount + alternateCount];
  if (!tieA || !tieB) {
    throw new Error(
      `alternate_boundary_tie needs at least ${callbackCount + alternateCount + 1} entries`
    );
  }

  const skipSlots = new Set<EntrySlot>();

  for (let j = 0; j < sheets.length; j++) {
    for (let k = 0; k < callbackCount && k < slots.length; k++) {
      sheets[j][slots[k]] = "yes";
      skipSlots.add(slots[k]);
    }
  }

  for (let a = 0; a < alternateCount - 1; a++) {
    const slot = slots[callbackCount + a];
    if (!slot) continue;
    for (let j = 0; j < sheets.length; j++) {
      sheets[j][slot] = ALT_RANKS[a];
    }
    skipSlots.add(slot);
  }

  const lastRank = ALT_RANKS[Math.min(alternateCount - 1, 2)];
  const balanceLimit =
    sheets.length % 2 === 0 ? sheets.length : sheets.length - 1;
  for (let j = 0; j < sheets.length; j++) {
    if (j < balanceLimit) {
      const onA = j % 2 === 0;
      sheets[j][tieA] = onA ? lastRank : "no";
      sheets[j][tieB] = onA ? "no" : lastRank;
    } else {
      sheets[j][tieA] = "no";
      sheets[j][tieB] = "no";
    }
  }
  skipSlots.add(tieA);
  skipSlots.add(tieB);

  fillJudgeQuotas(
    sheets,
    slots,
    callbackCount,
    alternateCount,
    skipSlots
  );
}

function applyCleanCallback(
  sheets: JudgeVoteSheet[],
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number
) {
  for (let j = 0; j < sheets.length; j++) {
    for (let k = 0; k < callbackCount && k < slots.length; k++) {
      sheets[j][slots[k]] = "yes";
    }
    for (let a = 0; a < alternateCount; a++) {
      const idx = callbackCount + a;
      if (idx < slots.length) {
        sheets[j][slots[idx]] = ALT_RANKS[Math.min(a, 2)];
      }
    }
  }
  fillJudgeQuotas(
    sheets,
    slots,
    callbackCount,
    alternateCount,
    new Set(slots.slice(0, callbackCount + alternateCount))
  );
}

/** CJ sheet for boundary ties: identical votes on tied pair so manual UI is still exercised. */
function buildCjSheetForBoundaryTie(
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number,
  edgeCase: "advance_boundary_tie" | "alternate_boundary_tie"
): JudgeVoteSheet {
  const sheet = emptySheet(slots);
  const skip = new Set<EntrySlot>();

  if (edgeCase === "advance_boundary_tie") {
    const leader = slots[0];
    const tieA = slots[callbackCount - 1];
    const tieB = slots[callbackCount];
    if (leader) {
      sheet[leader] = "yes";
      skip.add(leader);
    }
    if (tieA) {
      sheet[tieA] = "no";
      skip.add(tieA);
    }
    if (tieB) {
      sheet[tieB] = "no";
      skip.add(tieB);
    }
    assignAdvanceBoundaryCjAlts(
      sheet,
      slots,
      callbackCount,
      alternateCount,
      skip
    );
    fillSingleJudgeQuotas(sheet, slots, callbackCount, alternateCount, skip);
  } else {
    for (let k = 0; k < callbackCount && k < slots.length; k++) {
      sheet[slots[k]] = "yes";
      skip.add(slots[k]);
    }
    for (let a = 0; a < alternateCount - 1; a++) {
      const slot = slots[callbackCount + a];
      if (slot) {
        sheet[slot] = ALT_RANKS[a];
        skip.add(slot);
      }
    }
    const tieA = slots[callbackCount + alternateCount - 1];
    const tieB = slots[callbackCount + alternateCount];
    if (tieA) {
      sheet[tieA] = "no";
      skip.add(tieA);
    }
    if (tieB) {
      sheet[tieB] = "no";
      skip.add(tieB);
    }
    fillSingleJudgeQuotas(sheet, slots, callbackCount, alternateCount, skip);
  }

  return sheet;
}

function buildCjSheetClean(
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number
): JudgeVoteSheet {
  const sheet = emptySheet(slots);
  applyCleanCallback([sheet], slots, callbackCount, alternateCount);
  return sheet;
}

/** CJ sheet that breaks an advance-boundary panel tie (for auto-tabulate tests). */
export function buildCjSheetAdvanceBreak(
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number
): JudgeVoteSheet {
  const sheet = emptySheet(slots);
  const leader = slots[0];
  const tieA = slots[callbackCount - 1];
  const tieB = slots[callbackCount];
  const skip = new Set<EntrySlot>();
  if (leader) {
    sheet[leader] = "yes";
    skip.add(leader);
  }
  if (tieA) {
    sheet[tieA] = "yes";
    skip.add(tieA);
  }
  if (tieB) {
    sheet[tieB] = "no";
    skip.add(tieB);
  }
  assignAdvanceBoundaryCjAlts(
    sheet,
    slots,
    callbackCount,
    alternateCount,
    skip
  );
  fillSingleJudgeQuotas(sheet, slots, callbackCount, alternateCount, skip);
  return sheet;
}

export function generateCallbackVotes(
  params: CallbackGeneratorParams
): CallbackGeneratorResult {
  const {
    edgeCase,
    callbackCount,
    alternateCount,
    entryCount,
    judgeCount,
    slots: providedSlots,
  } = params;

  const slots = slotsForCount(entryCount, providedSlots);
  const panelSheets = emptySheets(judgeCount, slots);

  let result: CallbackGeneratorResult;
  switch (edgeCase) {
    case "advance_boundary_tie":
      applyAdvanceBoundaryTie(
        panelSheets,
        slots,
        callbackCount,
        alternateCount
      );
      result = {
        panelSheets,
        cjSheet: buildCjSheetForBoundaryTie(
          slots,
          callbackCount,
          alternateCount,
          "advance_boundary_tie"
        ),
      };
      break;
    case "alternate_boundary_tie":
      applyAlternateBoundaryTie(
        panelSheets,
        slots,
        callbackCount,
        alternateCount
      );
      result = {
        panelSheets,
        cjSheet: buildCjSheetForBoundaryTie(
          slots,
          callbackCount,
          alternateCount,
          "alternate_boundary_tie"
        ),
      };
      break;
    case "clean_callback":
    case "jnj_scope_smoke":
      applyCleanCallback(panelSheets, slots, callbackCount, alternateCount);
      result = {
        panelSheets,
        cjSheet: buildCjSheetClean(slots, callbackCount, alternateCount),
      };
      break;
    default:
      throw new Error(`Not a callback edge case: ${edgeCase}`);
  }

  assertAllSheetsMeetQuotas(
    result.panelSheets,
    result.cjSheet,
    slots,
    callbackCount,
    alternateCount
  );
  return result;
}

/** Validate generator output against scoreCallbacks. */
export function expectCallbackTabulation(
  panelSheets: JudgeVoteSheet[],
  slots: EntrySlot[],
  callbackCount: number,
  alternateCount: number,
  expectUnresolved: boolean,
  cjSheet?: JudgeVoteSheet
) {
  const judgeIds = panelSheets.map((_, i) => `j${i}`);
  const entryIds = slots;
  const votes: Record<string, Record<string, CallbackValue>> = {};
  for (let j = 0; j < panelSheets.length; j++) {
    votes[judgeIds[j]] = {};
    for (const slot of slots) {
      votes[judgeIds[j]][slot] = panelSheets[j][slot] ?? "no";
    }
  }
  const chiefJudgeVotes: Record<string, CallbackValue> = {};
  if (cjSheet) {
    for (const slot of slots) {
      chiefJudgeVotes[slot] = cjSheet[slot] ?? "no";
    }
  }
  const result = scoreCallbacks({
    judgeIds,
    entryIds,
    votes,
    callbackCount,
    alternateCount,
    chiefJudgeVotes: cjSheet ? chiefJudgeVotes : undefined,
  });
  if (expectUnresolved) {
    if (result.unresolvedTies.length === 0) {
      throw new Error("Expected unresolved ties but tabulation was clean");
    }
  } else if (result.unresolvedTies.length > 0) {
    throw new Error(
      `Expected clean tabulation but got ties: ${JSON.stringify(result.unresolvedTies)}`
    );
  }
  return result;
}
