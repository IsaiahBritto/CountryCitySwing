import { describe, expect, it } from "vitest";
import { canEditCheckin } from "@/lib/comps/roundState";

describe("canEditCheckin", () => {
  it("allows edits only during check-in", () => {
    expect(canEditCheckin("checkin")).toBe(true);
    expect(canEditCheckin("open")).toBe(false);
    expect(canEditCheckin("pending")).toBe(false);
    expect(canEditCheckin("closed")).toBe(false);
  });
});
