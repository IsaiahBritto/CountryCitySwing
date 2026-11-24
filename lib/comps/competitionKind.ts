import type { CompType } from "@/lib/comps/types";

/** Individual signups through event registration (JnJ or All American reuse jnj_* signup fields). */
export function usesJnSignupColumns(compType: CompType | string): boolean {
  return compType === "jack_and_jill" || compType === "all_american";
}

/** Prelims+ rounds judged as couples (strictly-style heats), after pairing for All American. */
export function usesStrictlyStyleCoupleRounds(compType: CompType | string): boolean {
  return compType === "strictly" || compType === "all_american";
}

/** Check in leads and follows separately before confirming fixed rotation pairings. */
export function usesPrePairingRound(compType: CompType | string): boolean {
  return compType === "jack_and_jill" || compType === "all_american";
}
