import { describe, expect, it } from "vitest";
import {
  PromoteAlternateError,
  requireFinalsPromoteRole,
  resolveCallbackAlternateSource,
} from "@/lib/comps/promoteAlternateResolve";
import { isJnJFinalsRound } from "@/lib/comps/jnjFinalsSeedHelpers";

describe("promote alternate role routing", () => {
  it("identifies JnJ finals pre-pairing rounds", () => {
    expect(isJnJFinalsRound("jack_and_jill", "final", null)).toBe(true);
    expect(isJnJFinalsRound("jack_and_jill", "semifinal", "lead")).toBe(false);
  });
});

describe("resolveCallbackAlternateSource", () => {
  const leadCallbackRound = {
    id: "r1",
    competition_id: "c1",
    round_type: "quarterfinal" as const,
    judged_role: "lead" as const,
    source_round_id: "src-lead",
  };

  it("uses source_round_id for callback rounds", () => {
    expect(
      resolveCallbackAlternateSource(leadCallbackRound, undefined)
    ).toEqual({
      sourceRoundId: "src-lead",
      checkinRole: "lead",
    });
  });

  it("rejects mismatched role on callback rounds", () => {
    expect(() =>
      resolveCallbackAlternateSource(leadCallbackRound, "follow")
    ).toThrow(PromoteAlternateError);
  });
});

describe("requireFinalsPromoteRole", () => {
  const finalsRound = {
    id: "finals",
    competition_id: "c1",
    round_type: "final" as const,
    judged_role: null,
    source_round_id: "src-lead",
  };

  it("requires role on JnJ finals", () => {
    expect(() =>
      requireFinalsPromoteRole("jack_and_jill", finalsRound, undefined)
    ).toThrow(PromoteAlternateError);
  });

  it("accepts lead or follow", () => {
    expect(
      requireFinalsPromoteRole("jack_and_jill", finalsRound, "lead")
    ).toBe("lead");
    expect(
      requireFinalsPromoteRole("jack_and_jill", finalsRound, "follow")
    ).toBe("follow");
  });
});
