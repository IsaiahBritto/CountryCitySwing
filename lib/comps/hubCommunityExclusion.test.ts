import { describe, expect, it } from "vitest";
import { isCcsHubLiveCompetition } from "@/lib/comps/hubCommunityExclusion";

describe("hubCommunityExclusion", () => {
  it("excludes community host_kind from live hub", () => {
    expect(isCcsHubLiveCompetition("community")).toBe(false);
    expect(isCcsHubLiveCompetition("ccs")).toBe(true);
    expect(isCcsHubLiveCompetition(null)).toBe(true);
  });
});