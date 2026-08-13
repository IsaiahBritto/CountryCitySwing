import { describe, expect, it } from "vitest";
import {
  CHAIN_DEBOUNCE_MS,
  RETRY_DELAY_MS,
  followUpFlushDelayMs,
  mergeScorePatch,
  pruneAckedPending,
} from "@/lib/comps/autosaveHelpers";

describe("autosaveHelpers", () => {
  it("merges score patches by round entry id", () => {
    const merged = mergeScorePatch(
      { round_entry_id: "a", raw_score: 50 },
      { round_entry_id: "a", callback_value: "yes" }
    );
    expect(merged).toEqual({
      round_entry_id: "a",
      raw_score: 50,
      callback_value: "yes",
    });
  });

  it("uses short chain delay after success and long delay after failure", () => {
    expect(followUpFlushDelayMs(false)).toBe(CHAIN_DEBOUNCE_MS);
    expect(followUpFlushDelayMs(true)).toBe(RETRY_DELAY_MS);
  });

  it("prunes only unchanged pending entries after ack", () => {
    const sentA = { round_entry_id: "a", raw_score: 50 };
    const sentB = { round_entry_id: "b", raw_score: 60 };
    const sent: [string, typeof sentA][] = [
      ["a", sentA],
      ["b", sentB],
    ];
    const pending = new Map([
      ["a", sentA],
      ["b", { round_entry_id: "b", raw_score: 70 }],
    ]);
    pruneAckedPending(pending, sent);
    expect(pending.has("a")).toBe(false);
    expect(pending.get("b")?.raw_score).toBe(70);
  });
});
