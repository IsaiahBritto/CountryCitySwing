import { describe, expect, it } from "vitest";
import { slotAtIndex } from "../types";
import {
  generateCallbackVotes,
  expectCallbackTabulation,
  buildCjSheetAdvanceBreak,
  assertCallbackSheetQuotas,
} from "./callbackVotes";

describe("slotAtIndex", () => {
  it("labels entries A, B, … Z, AA", () => {
    expect(slotAtIndex(0)).toBe("A");
    expect(slotAtIndex(25)).toBe("Z");
    expect(slotAtIndex(26)).toBe("AA");
  });
});

function assertAllSheetsMeetQuotas(
  panelSheets: ReturnType<typeof generateCallbackVotes>["panelSheets"],
  cjSheet: ReturnType<typeof generateCallbackVotes>["cjSheet"],
  slots: string[],
  callbackCount: number,
  alternateCount: number
) {
  for (const sheet of panelSheets) {
    assertCallbackSheetQuotas(sheet, slots, callbackCount, alternateCount);
  }
  assertCallbackSheetQuotas(cjSheet, slots, callbackCount, alternateCount);
}

describe("generateCallbackVotes", () => {
  const slots30 = Array.from({ length: 30 }, (_, i) => slotAtIndex(i));

  it("advance_boundary_tie produces unresolved advance tie with matching CJ votes (K=2)", () => {
    const slots = slots30.slice(0, 5);
    const { panelSheets, cjSheet } = generateCallbackVotes({
      edgeCase: "advance_boundary_tie",
      callbackCount: 2,
      alternateCount: 1,
      entryCount: 5,
      judgeCount: 5,
    });
    assertAllSheetsMeetQuotas(panelSheets, cjSheet, slots, 2, 1);
    expectCallbackTabulation(
      panelSheets,
      slots,
      2,
      1,
      true,
      cjSheet
    );
  });

  it("advance_boundary_tie scales to large roster (K=3)", () => {
    const { panelSheets, cjSheet } = generateCallbackVotes({
      edgeCase: "advance_boundary_tie",
      callbackCount: 3,
      alternateCount: 2,
      entryCount: 30,
      judgeCount: 5,
      slots: slots30,
    });
    assertAllSheetsMeetQuotas(panelSheets, cjSheet, slots30, 3, 2);
    expectCallbackTabulation(panelSheets, slots30, 3, 2, true, cjSheet);
  });

  it("advance_boundary_tie at test-comp prelims scale (22+2 alts)", () => {
    const { panelSheets, cjSheet } = generateCallbackVotes({
      edgeCase: "advance_boundary_tie",
      callbackCount: 22,
      alternateCount: 2,
      entryCount: 30,
      judgeCount: 5,
      slots: slots30,
    });
    assertAllSheetsMeetQuotas(panelSheets, cjSheet, slots30, 22, 2);
    expectCallbackTabulation(panelSheets, slots30, 22, 2, true, cjSheet);
  });

  it("advance_boundary_tie tabulates clean when CJ breaks the tie", () => {
    const slots = slots30.slice(0, 5);
    const { panelSheets } = generateCallbackVotes({
      edgeCase: "advance_boundary_tie",
      callbackCount: 2,
      alternateCount: 1,
      entryCount: 5,
      judgeCount: 5,
    });
    const cjSheet = buildCjSheetAdvanceBreak(slots, 2, 1);
    assertCallbackSheetQuotas(cjSheet, slots, 2, 1);
    const result = expectCallbackTabulation(
      panelSheets,
      slots,
      2,
      1,
      false,
      cjSheet
    );
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.B.advanced).toBe(true);
    expect(byId.C.advanced).toBe(false);
    expect(byId.B.resolvedByChiefJudge).toBe(true);
  });

  it("clean_callback tabulates without ties", () => {
    const slots = slots30.slice(0, 8);
    const { panelSheets, cjSheet } = generateCallbackVotes({
      edgeCase: "clean_callback",
      callbackCount: 2,
      alternateCount: 1,
      entryCount: 8,
      judgeCount: 5,
    });
    assertAllSheetsMeetQuotas(panelSheets, cjSheet, slots, 2, 1);
    expectCallbackTabulation(
      panelSheets,
      slots,
      2,
      1,
      false,
      cjSheet
    );
  });

  it("alternate_boundary_tie produces unresolved alternate tie with matching CJ votes", () => {
    const slots = slots30.slice(0, 6);
    const { panelSheets, cjSheet } = generateCallbackVotes({
      edgeCase: "alternate_boundary_tie",
      callbackCount: 1,
      alternateCount: 2,
      entryCount: 6,
      judgeCount: 5,
    });
    assertAllSheetsMeetQuotas(panelSheets, cjSheet, slots, 1, 2);
    expectCallbackTabulation(
      panelSheets,
      slots,
      1,
      2,
      true,
      cjSheet
    );
  });

  it("alternate_boundary_tie at semifinal scale (10+2 alts)", () => {
    const slots16 = slots30.slice(0, 16);
    const { panelSheets, cjSheet } = generateCallbackVotes({
      edgeCase: "alternate_boundary_tie",
      callbackCount: 10,
      alternateCount: 2,
      entryCount: 16,
      judgeCount: 5,
      slots: slots16,
    });
    assertAllSheetsMeetQuotas(panelSheets, cjSheet, slots16, 10, 2);
    expectCallbackTabulation(panelSheets, slots16, 10, 2, true, cjSheet);
  });

  it("throws when advance tie needs more entries", () => {
    expect(() =>
      generateCallbackVotes({
        edgeCase: "advance_boundary_tie",
        callbackCount: 5,
        alternateCount: 2,
        entryCount: 3,
        judgeCount: 5,
      })
    ).toThrow(/needs at least/);
  });
});
