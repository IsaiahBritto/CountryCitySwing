import { describe, expect, it } from "vitest";
import {
  canOpenRound,
  findNextEnabledRound,
  findPreviousEnabledRound,
  isFirstEnabledSlot,
  isSlotSkipped,
  ROUND_SLOT_ORDER,
} from "@/lib/comps/roundChain";
import type { RoundSlotRef } from "@/lib/comps/roundChain";

const r = (
  id: string,
  round_type: RoundSlotRef["round_type"],
  status: RoundSlotRef["status"],
  judged_role: RoundSlotRef["judged_role"] = null
): RoundSlotRef => ({
  id,
  round_type,
  judged_role,
  status,
});

describe("roundChain", () => {
  it("findPreviousEnabledRound skips disabled quarterfinal slot", () => {
    const rounds = [
      r("p", "prelims", "published"),
      r("s", "semifinal", "pending"),
    ];
    expect(findPreviousEnabledRound(rounds, "semifinal")?.id).toBe("p");
  });

  it("isFirstEnabledSlot when only semis enabled after skipping prelims/quarters", () => {
    const rounds = [r("s", "semifinal", "pending")];
    expect(isFirstEnabledSlot(rounds, "semifinal")).toBe(true);
  });

  it("isSlotSkipped when no row exists for type", () => {
    const rounds = [r("p", "prelims", "pending")];
    expect(isSlotSkipped(rounds, "quarterfinal")).toBe(true);
    expect(isSlotSkipped(rounds, "prelims")).toBe(false);
  });

  it("canOpenRound blocks semis until prelims finalized", () => {
    const rounds = [
      r("p", "prelims", "closed"),
      r("s", "semifinal", "pending"),
    ];
    const semi = rounds[1];
    expect(canOpenRound(rounds, semi)).toEqual({
      ok: false,
      reason: "Finalize Prelims before starting Semifinal",
    });
  });

  it("canOpenRound allows first enabled slot without prior round", () => {
    const rounds = [r("p", "prelims", "pending")];
    expect(canOpenRound(rounds, rounds[0])).toEqual({ ok: true });
  });

  it("findNextEnabledRound skips quarterfinal when disabled", () => {
    const rounds = [
      r("p", "prelims", "tabulated"),
      r("s", "semifinal", "pending"),
    ];
    expect(findNextEnabledRound(rounds, "prelims")?.id).toBe("s");
  });

  it("JnJ findPreviousEnabledRound matches judged_role", () => {
    const rounds = [
      r("pl", "prelims", "published", "lead"),
      r("pf", "prelims", "published", "follow"),
      r("ql", "quarterfinal", "pending", "lead"),
    ];
    expect(findPreviousEnabledRound(rounds, "quarterfinal", "lead")?.id).toBe(
      "pl"
    );
    expect(findPreviousEnabledRound(rounds, "quarterfinal", "follow")?.id).toBe(
      "pf"
    );
  });

  it("ROUND_SLOT_ORDER has four fixed stages", () => {
    expect(ROUND_SLOT_ORDER).toEqual([
      "prelims",
      "quarterfinal",
      "semifinal",
      "final",
    ]);
  });
});
