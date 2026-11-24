import { describe, expect, it } from "vitest";
import { formatDivisionListLabel } from "@/lib/comps/divisionDisplay";

describe("formatDivisionListLabel", () => {
  it("combines competition name and type", () => {
    expect(formatDivisionListLabel("Newcomer", "jack_and_jill")).toBe(
      "Newcomer (Jack & Jill)"
    );
    expect(formatDivisionListLabel("All-Level", "strictly")).toBe(
      "All-Level (Strictly)"
    );
  });
});
