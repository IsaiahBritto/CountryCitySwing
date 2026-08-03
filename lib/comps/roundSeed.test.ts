import { describe, expect, it } from "vitest";
import {
  isJnJFinalsRound,
  needsJnJFinalsReseed,
} from "@/lib/comps/jnjFinalsSeedHelpers";

describe("roundSeed helpers", () => {
  it("isJnJFinalsRound identifies JnJ couple finals", () => {
    expect(isJnJFinalsRound("jack_and_jill", "final", null)).toBe(true);
    expect(isJnJFinalsRound("jack_and_jill", "semifinal", "lead")).toBe(false);
    expect(isJnJFinalsRound("strictly", "final", null)).toBe(false);
  });

  it("needsJnJFinalsReseed when empty or no checkin_role", () => {
    expect(needsJnJFinalsReseed([])).toBe(true);
    expect(needsJnJFinalsReseed([{ checkin_role: null }])).toBe(true);
    expect(
      needsJnJFinalsReseed([
        { checkin_role: null },
        { checkin_role: null },
      ])
    ).toBe(true);
    expect(
      needsJnJFinalsReseed([
        { checkin_role: "lead" },
        { checkin_role: null },
      ])
    ).toBe(false);
  });
});
