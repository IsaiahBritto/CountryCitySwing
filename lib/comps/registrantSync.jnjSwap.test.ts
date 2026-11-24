import { describe, expect, it } from "vitest";
import type { CompSignupRow } from "@/lib/comps/types";

/** Pure mirror of swapJnJOnSignup field movement (no DB). */
function swapJnJOnSignupPure(signup: CompSignupRow): CompSignupRow {
  return {
    ...signup,
    jnj_lead_first_name: signup.jnj_follow_first_name,
    jnj_lead_last_name: signup.jnj_follow_last_name,
    jnj_lead_email: signup.jnj_follow_email,
    jnj_lead_profile_id: signup.jnj_follow_profile_id,
    jnj_follow_first_name: signup.jnj_lead_first_name,
    jnj_follow_last_name: signup.jnj_lead_last_name,
    jnj_follow_email: signup.jnj_lead_email,
    jnj_follow_profile_id: signup.jnj_lead_profile_id,
  };
}

describe("JnJ signup role swap shape", () => {
  it("moves identity between lead and follow columns", () => {
    const signup = {
      id: "s1",
      event_id: "e1",
      event_title: "GAC",
      registrant_profile_id: "p1",
      jnj_selected: true,
      jnj_lead_first_name: "Alex",
      jnj_lead_last_name: "A",
      jnj_lead_email: "alex@example.com",
      jnj_lead_profile_id: "p1",
      jnj_follow_first_name: null,
      jnj_follow_last_name: null,
      jnj_follow_email: null,
      jnj_follow_profile_id: null,
    } as unknown as CompSignupRow;

    const swapped = swapJnJOnSignupPure(signup);
    expect(swapped.jnj_follow_first_name).toBe("Alex");
    expect(swapped.jnj_lead_first_name).toBeNull();
    expect(swapped.jnj_follow_profile_id).toBe("p1");
    expect(swapped.jnj_lead_profile_id).toBeNull();
  });
});