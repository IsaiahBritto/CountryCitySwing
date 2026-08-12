import { isJnJFinalsRound } from "@/lib/comps/jnjFinalsSeedHelpers";
import type { CompType, DanceRole, RoundType } from "@/lib/comps/types";

export interface PromoteAlternateRound {
  id: string;
  competition_id: string;
  round_type: RoundType;
  judged_role: DanceRole | null;
  source_round_id: string | null;
}

export class PromoteAlternateError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/** Callback-round source resolution (no I/O). */
export function resolveCallbackAlternateSource(
  round: PromoteAlternateRound,
  role?: DanceRole
): { sourceRoundId: string; checkinRole: DanceRole | null } {
  if (!round.source_round_id) {
    throw new PromoteAlternateError(
      "This round has no source round to promote alternates from"
    );
  }

  const inferredRole = round.judged_role;
  if (role != null && inferredRole != null && role !== inferredRole) {
    throw new PromoteAlternateError(
      `This round only supports promoting ${inferredRole} alternates`
    );
  }

  return {
    sourceRoundId: round.source_round_id,
    checkinRole: inferredRole,
  };
}

export function requireFinalsPromoteRole(
  compType: CompType,
  round: PromoteAlternateRound,
  role: DanceRole | undefined
): DanceRole {
  if (!isJnJFinalsRound(compType, round.round_type, round.judged_role)) {
    throw new PromoteAlternateError("Internal: not a JnJ finals round", 500);
  }
  if (role !== "lead" && role !== "follow") {
    throw new PromoteAlternateError(
      "role must be lead or follow when promoting alternates on JnJ finals",
      400
    );
  }
  return role;
}
