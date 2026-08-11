import { describe, expect, it } from "vitest";
import { slotAtIndex } from "../types";
import {
  generateOrdinalVotes,
  expectOrdinalTabulation,
  assertMaxSamePlacement,
} from "./ordinalVotes";

function expectSheetsNotAllIdentical(
  sheets: ReturnType<typeof generateOrdinalVotes>["judgeOrdinals"]
) {
  if (sheets.length <= 1) return;
  const first = JSON.stringify(sheets[0]);
  expect(sheets.some((sheet) => JSON.stringify(sheet) !== first)).toBe(true);
}

describe("generateOrdinalVotes", () => {
  it("rp_head_to_head_break resolves cleanly", () => {
    const result = generateOrdinalVotes({
      edgeCase: "rp_head_to_head_break",
      entryCount: 3,
      judgeCount: 5,
    });
    expectOrdinalTabulation(result, ["A", "B", "C"], false);
  });

  it("rp_cycle_cj_break resolves with CJ ordinals", () => {
    const result = generateOrdinalVotes({
      edgeCase: "rp_cycle_cj_break",
      entryCount: 3,
      judgeCount: 5,
    });
    expectOrdinalTabulation(result, ["A", "B", "C"], false);
  });

  it("rp_clean tabulates without ties with varied ordinals", () => {
    const slots = ["A", "B", "C", "D", "E"];
    const result = generateOrdinalVotes({
      edgeCase: "rp_clean",
      entryCount: 5,
      judgeCount: 5,
    });
    assertMaxSamePlacement(result.judgeOrdinals, slots);
    expectSheetsNotAllIdentical(result.judgeOrdinals);
    expectOrdinalTabulation(result, slots, false);
  });

  it("jnj_scope_smoke produces clean varied ordinals on larger field", () => {
    const slots = ["A", "B", "C", "D", "E", "F"];
    const result = generateOrdinalVotes({
      edgeCase: "jnj_scope_smoke",
      entryCount: 6,
      judgeCount: 6,
      slots,
    });
    assertMaxSamePlacement(result.judgeOrdinals, slots);
    expectSheetsNotAllIdentical(result.judgeOrdinals);
    expectOrdinalTabulation(result, slots, false);
  });

  it("jnj_scope_smoke at finals scale (10 couples, 5 judges)", () => {
    const slots = Array.from({ length: 10 }, (_, i) => slotAtIndex(i));
    const result = generateOrdinalVotes({
      edgeCase: "jnj_scope_smoke",
      entryCount: 10,
      judgeCount: 5,
      slots,
    });
    assertMaxSamePlacement(result.judgeOrdinals, slots);
    expectSheetsNotAllIdentical(result.judgeOrdinals);
    for (const sheet of result.judgeOrdinals) {
      const values = slots.map((s) => sheet[s]!);
      expect(new Set(values).size).toBe(10);
      expect(Math.min(...values)).toBe(1);
      expect(Math.max(...values)).toBe(10);
    }
    expectOrdinalTabulation(result, slots, false);
  });

  it("rp_cycle_cj_break produces unique ordinals with 10 entries", () => {
    const slots = Array.from({ length: 10 }, (_, i) => slotAtIndex(i));
    const result = generateOrdinalVotes({
      edgeCase: "rp_cycle_cj_break",
      entryCount: 10,
      judgeCount: 5,
      slots,
    });
    for (const sheet of result.judgeOrdinals) {
      const values = slots.map((s) => sheet[s]!);
      expect(new Set(values).size).toBe(10);
      expect(Math.min(...values)).toBe(1);
      expect(Math.max(...values)).toBe(10);
    }
    if (result.cjOrdinals) {
      const cjValues = slots.map((s) => result.cjOrdinals![s]!);
      expect(new Set(cjValues).size).toBe(10);
    }
    expectOrdinalTabulation(result, slots, false);
  });
});
