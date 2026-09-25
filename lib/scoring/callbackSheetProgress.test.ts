import { describe, expect, it } from "vitest";
import { callbackPrimaryComplete } from "./callbackSheetProgress";
import type { CallbackVote } from "./callbackRawSync";

describe("callbackPrimaryComplete", () => {
  const ids = ["A", "B", "C"];

  it("placement incomplete when any vote missing", () => {
    const votes = new Map<string, CallbackVote>([
      ["A", "yes"],
      ["B", "no"],
    ]);
    const raw = new Map<string, number | null>();
    expect(
      callbackPrimaryComplete("placement", ids, votes, raw)
    ).toBe(false);
  });

  it("placement complete when all voted", () => {
    const votes = new Map<string, CallbackVote>([
      ["A", "yes"],
      ["B", "alt1"],
      ["C", "no"],
    ]);
    const raw = new Map<string, number | null>();
    expect(callbackPrimaryComplete("placement", ids, votes, raw)).toBe(true);
  });

  it("raw incomplete when any raw null", () => {
    const votes = new Map<string, CallbackVote>();
    const raw = new Map<string, number | null>([
      ["A", 80],
      ["B", 50],
    ]);
    expect(callbackPrimaryComplete("raw", ids, votes, raw)).toBe(false);
  });

  it("raw complete when all raws set", () => {
    const votes = new Map<string, CallbackVote>();
    const raw = new Map<string, number | null>([
      ["A", 80],
      ["B", 50],
      ["C", 10],
    ]);
    expect(callbackPrimaryComplete("raw", ids, votes, raw)).toBe(true);
  });

  it("empty entry list is not complete", () => {
    expect(
      callbackPrimaryComplete(
        "placement",
        [],
        new Map(),
        new Map()
      )
    ).toBe(false);
  });
});
