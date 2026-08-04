import type { EdgeCaseType } from "../playbook";
import { isCallbackEdgeCase, isOrdinalEdgeCase } from "../playbook";
import type { EntrySlot, JudgeOrdinalSheet, JudgeVoteSheet } from "../sheetTypes";
import {
  generateCallbackVotes,
  type CallbackGeneratorParams,
} from "./callbackVotes";
import {
  generateOrdinalVotes,
  type OrdinalGeneratorParams,
  type OrdinalGeneratorResult,
} from "./ordinalVotes";

export type { CallbackGeneratorParams } from "./callbackVotes";
export type { OrdinalGeneratorParams, OrdinalGeneratorResult } from "./ordinalVotes";

export interface GeneratorParams {
  edgeCase: EdgeCaseType;
  callbackCount: number;
  alternateCount: number;
  entryCount: number;
  judgeCount: number;
  slots?: EntrySlot[];
}

export interface GeneratedScores {
  judgeVotes?: JudgeVoteSheet[];
  cjVotes?: JudgeVoteSheet;
  judgeOrdinals?: JudgeOrdinalSheet[];
  cjOrdinals?: Partial<Record<EntrySlot, number>>;
}

export function generateScores(params: GeneratorParams): GeneratedScores {
  const { edgeCase } = params;
  if (isCallbackEdgeCase(edgeCase)) {
    const generated = generateCallbackVotes(params as CallbackGeneratorParams);
    return {
      judgeVotes: generated.panelSheets,
      cjVotes: generated.cjSheet,
    };
  }
  if (isOrdinalEdgeCase(edgeCase)) {
    const ord = generateOrdinalVotes(params as OrdinalGeneratorParams);
    return {
      judgeOrdinals: ord.judgeOrdinals,
      cjOrdinals: ord.cjOrdinals,
    };
  }
  throw new Error(`Unknown edge case: ${edgeCase}`);
}

export { generateCallbackVotes, expectCallbackTabulation } from "./callbackVotes";
export { generateOrdinalVotes, expectOrdinalTabulation } from "./ordinalVotes";
