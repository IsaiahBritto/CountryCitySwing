import type { CompType, DanceRole, RoundType } from "@/lib/comps/types";

export class JnJFinalsSeedError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "JnJFinalsSeedError";
  }
}

export function isJnJFinalsRound(
  compType: CompType,
  roundType: RoundType,
  judgedRole: DanceRole | null
): boolean {
  return (
    compType === "jack_and_jill" && roundType === "final" && judgedRole == null
  );
}

/** All American: Prelims is lead+follow check-in then rotation; before confirm, individuals only. */
export function isAllAmericanPrelimsPrePairing(
  compType: CompType,
  roundType: RoundType,
  judgedRole: DanceRole | null,
  pairingsConfirmedAt: string | null
): boolean {
  return (
    compType === "all_american" &&
    roundType === "prelims" &&
    judgedRole == null &&
    pairingsConfirmedAt == null
  );
}

export function needsJnJFinalsReseed(
  roundEntries: { checkin_role: string | null }[]
): boolean {
  return (
    roundEntries.length === 0 ||
    roundEntries.every((re) => re.checkin_role == null)
  );
}
