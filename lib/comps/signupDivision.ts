import type { CompSignupRow, CompType } from "@/lib/comps/types";

export type EventDivisionRow = {
  id: string;
  name: string;
  comp_type: CompType | string;
  test_comp?: boolean | null;
};

export type ResolvedSignupDivisionIds = {
  jnj_competition_id: string | null;
  strictly_competition_id: string | null;
  all_american_competition_id: string | null;
};

export type SignupDivisionSelectionInput = {
  strictlySelected: boolean;
  jnjSelected: boolean;
  allAmericanSelected: boolean;
  jnjCompetitionId?: string | null;
  strictlyCompetitionId?: string | null;
  allAmericanCompetitionId?: string | null;
};

function eventDivisions(
  competitions: EventDivisionRow[],
  compType: CompType
): EventDivisionRow[] {
  return competitions.filter(
    (c) => c.comp_type === compType && !c.test_comp
  );
}

function divisionCount(competitions: EventDivisionRow[], compType: CompType) {
  return eventDivisions(competitions, compType).length;
}

function resolveIdForType(
  compType: CompType,
  selected: boolean,
  clientId: string | null | undefined,
  competitions: EventDivisionRow[]
): { id: string | null; error?: string } {
  if (!selected) return { id: null };
  const pool = eventDivisions(competitions, compType);
  if (pool.length === 0) {
    return { id: null, error: `This event has no ${compType} division to register for` };
  }
  if (pool.length === 1) {
    const only = pool[0]!.id;
    const trimmed = clientId?.trim();
    if (trimmed && trimmed !== only) {
      return { id: null, error: "Invalid division for this event" };
    }
    return { id: only };
  }
  const trimmed = clientId?.trim();
  if (!trimmed) {
    return { id: null, error: "Choose a division" };
  }
  if (!pool.some((c) => c.id === trimmed)) {
    return { id: null, error: "Division does not belong to this event" };
  }
  return { id: trimmed };
}

/** Validate division picks and auto-fill when the event has a single division per type. */
export function resolveSignupDivisionIds(
  input: SignupDivisionSelectionInput,
  competitions: EventDivisionRow[]
): { error: string; status: number } | ResolvedSignupDivisionIds {
  const jnj = resolveIdForType(
    "jack_and_jill",
    input.jnjSelected,
    input.jnjCompetitionId,
    competitions
  );
  if (jnj.error) return { error: jnj.error, status: 400 };

  const strictly = resolveIdForType(
    "strictly",
    input.strictlySelected,
    input.strictlyCompetitionId,
    competitions
  );
  if (strictly.error) return { error: strictly.error, status: 400 };

  const allAmerican = resolveIdForType(
    "all_american",
    input.allAmericanSelected,
    input.allAmericanCompetitionId,
    competitions
  );
  if (allAmerican.error) return { error: allAmerican.error, status: 400 };

  return {
    jnj_competition_id: jnj.id,
    strictly_competition_id: strictly.id,
    all_american_competition_id: allAmerican.id,
  };
}

export type SignupDivisionMatchFields = Pick<
  CompSignupRow,
  | "jnj_selected"
  | "strictly_selected"
  | "all_american_selected"
  | "jnj_competition_id"
  | "strictly_competition_id"
  | "all_american_competition_id"
>;

export function storedCompetitionIdForType(
  signup: SignupDivisionMatchFields,
  compType: CompType
): string | null {
  if (compType === "jack_and_jill") return signup.jnj_competition_id ?? null;
  if (compType === "strictly") return signup.strictly_competition_id ?? null;
  return signup.all_american_competition_id ?? null;
}

function typeSelected(
  signup: SignupDivisionMatchFields,
  compType: CompType
): boolean {
  if (compType === "jack_and_jill") return !!signup.jnj_selected;
  if (compType === "strictly") return !!signup.strictly_selected;
  return !!signup.all_american_selected;
}

/** Whether a signup row should appear on import for a given competition division. */
export function signupMatchesCompetition(
  signup: SignupDivisionMatchFields,
  competition: { id: string; comp_type: CompType | string },
  competitions: EventDivisionRow[]
): boolean {
  const compType = competition.comp_type as CompType;
  if (!typeSelected(signup, compType)) return false;

  const stored = storedCompetitionIdForType(signup, compType);
  if (stored) return stored === competition.id;

  const count = divisionCount(competitions, compType);
  if (count === 1) return true;
  return true;
}

export function signupDivisionLegacyWarning(
  signup: SignupDivisionMatchFields,
  compType: CompType,
  competitions: EventDivisionRow[]
): string | null {
  if (!typeSelected(signup, compType)) return null;
  if (storedCompetitionIdForType(signup, compType)) return null;
  if (divisionCount(competitions, compType) <= 1) return null;
  return "No division stored on signup (legacy); verify this person belongs in this division";
}

export function signupSelectedColumn(compType: CompType | string): string {
  if (compType === "strictly") return "strictly_selected";
  if (compType === "all_american") return "all_american_selected";
  return "jnj_selected";
}

export function divisionCounts(competitions: EventDivisionRow[]) {
  return {
    jnj: divisionCount(competitions, "jack_and_jill"),
    strictly: divisionCount(competitions, "strictly"),
    allAmerican: divisionCount(competitions, "all_american"),
  };
}

/** Target division for imports/edits: PATCH override, then signup column, then single-division auto-pick. */
export function divisionSelectionsChanged(
  current: {
    jnjCompetitionId: string | null;
    strictlyCompetitionId: string | null;
    allAmericanCompetitionId: string | null;
  },
  patch?: {
    jnjCompetitionId?: string | null;
    strictlyCompetitionId?: string | null;
    allAmericanCompetitionId?: string | null;
  }
): boolean {
  if (!patch) return false;
  if (
    patch.jnjCompetitionId !== undefined &&
    (patch.jnjCompetitionId ?? null) !== current.jnjCompetitionId
  ) {
    return true;
  }
  if (
    patch.strictlyCompetitionId !== undefined &&
    (patch.strictlyCompetitionId ?? null) !== current.strictlyCompetitionId
  ) {
    return true;
  }
  if (
    patch.allAmericanCompetitionId !== undefined &&
    (patch.allAmericanCompetitionId ?? null) !== current.allAmericanCompetitionId
  ) {
    return true;
  }
  return false;
}

export function targetCompetitionIdForSignup(
  signup: SignupDivisionMatchFields,
  compType: CompType,
  competitions: EventDivisionRow[],
  override?: string | null | undefined
): string | null {
  if (override !== undefined) {
    const trimmed = override?.trim();
    if (trimmed) return trimmed;
  }
  const stored = storedCompetitionIdForType(signup, compType);
  if (stored) return stored;
  const pool = eventDivisions(competitions, compType);
  if (pool.length === 1) return pool[0]!.id;
  return null;
}
