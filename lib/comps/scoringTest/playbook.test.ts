import { describe, expect, it } from "vitest";
import { lookupPlaybookEntry } from "./playbook";

describe("lookupPlaybookEntry", () => {
  it("returns Strictly prelims advance tie scenario", () => {
    const entry = lookupPlaybookEntry("strictly", "prelims", null);
    expect(entry?.edgeCase).toBe("advance_boundary_tie");
    expect(entry?.label).toMatch(/Advance boundary tie/);
  });

  it("returns JnJ role-specific prelims scenarios", () => {
    expect(
      lookupPlaybookEntry("jack_and_jill", "prelims", "lead")?.edgeCase
    ).toBe("advance_boundary_tie");
    expect(
      lookupPlaybookEntry("jack_and_jill", "prelims", "follow")?.edgeCase
    ).toBe("clean_callback");
  });

  it("returns JnJ role-specific quarterfinal and semifinal scenarios", () => {
    expect(
      lookupPlaybookEntry("jack_and_jill", "quarterfinal", "lead")?.edgeCase
    ).toBe("clean_callback");
    expect(
      lookupPlaybookEntry("jack_and_jill", "quarterfinal", "follow")?.edgeCase
    ).toBe("clean_callback");
    expect(
      lookupPlaybookEntry("jack_and_jill", "semifinal", "lead")?.edgeCase
    ).toBe("alternate_boundary_tie");
    expect(
      lookupPlaybookEntry("jack_and_jill", "semifinal", "follow")?.edgeCase
    ).toBe("alternate_boundary_tie");
  });

  it("returns null for unconfigured slots", () => {
    expect(
      lookupPlaybookEntry("jack_and_jill", "quarterfinal", null)
    ).toBeNull();
  });
});
