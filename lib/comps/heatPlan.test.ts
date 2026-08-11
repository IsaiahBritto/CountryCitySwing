import { describe, expect, it } from "vitest";
import {
  autoHeatCountFromFloor,
  computeHeatPlan,
  distributeEvenly,
  previewAutoHeatCount,
} from "@/lib/comps/heatPlan";

function leadEntries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `l${i + 1}`,
    bibNumber: 100 + i,
    poolRole: "lead" as const,
  }));
}

function followEntries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `f${i + 1}`,
    bibNumber: 200 + i,
    poolRole: "follow" as const,
  }));
}

function coupleEntries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    bibNumber: 300 + i,
    poolRole: "couple" as const,
  }));
}

describe("distributeEvenly", () => {
  it("splits 30 into 2 heats of 15", () => {
    expect(distributeEvenly(30, 2)).toEqual([15, 15]);
  });

  it("splits 28 into 2 heats of 14", () => {
    expect(distributeEvenly(28, 2)).toEqual([14, 14]);
  });

  it("splits 10 into 3 heats as 4,3,3", () => {
    expect(distributeEvenly(10, 3)).toEqual([4, 3, 3]);
  });
});

describe("autoHeatCountFromFloor", () => {
  it("uses max(L,F) and max floor size", () => {
    expect(autoHeatCountFromFloor(30, 30, 17)).toBe(2);
    expect(autoHeatCountFromFloor(20, 30, 17)).toBe(2);
    expect(autoHeatCountFromFloor(28, 28, 15)).toBe(2);
  });
});

describe("computeHeatPlan auto mode", () => {
  it("symmetric 30L/30F yields 2 heats of 15 with no returns", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 17,
      heatCountOverride: null,
      compType: "jack_and_jill",
      roundJudgedRole: "lead",
      leadCount: 30,
      followCount: 30,
      entries: leadEntries(30),
    });
    expect(plan.heatCount).toBe(2);
    expect(plan.couplesPerHeat).toEqual([15, 15]);
    expect(plan.heatSizes).toEqual([15, 15]);
    expect(plan.heatReturnCount).toBe(0);
    expect(plan.heatReturnRole).toBeNull();
  });

  it("symmetric 28L/28F yields 2 heats of 14 with no returns", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 15,
      heatCountOverride: null,
      compType: "jack_and_jill",
      roundJudgedRole: "lead",
      leadCount: 28,
      followCount: 28,
      entries: leadEntries(28),
    });
    expect(plan.heatCount).toBe(2);
    expect(plan.couplesPerHeat).toEqual([14, 14]);
    expect(plan.heatSizes).toEqual([14, 14]);
    expect(plan.heatReturnCount).toBe(0);
    expect(plan.heatReturnRole).toBeNull();
  });

  it("keeps 15+15 caps when one lead is absent but backfills from heat 2", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 17,
      heatCountOverride: null,
      compType: "jack_and_jill",
      roundJudgedRole: "lead",
      leadCount: 29,
      followCount: 30,
      entries: leadEntries(29),
    });
    expect(plan.heatCount).toBe(2);
    expect(plan.couplesPerHeat).toEqual([15, 15]);
    expect(plan.heatSizes).toEqual([15, 14]);
    expect(plan.heatReturnCount).toBe(1);
    expect(plan.heatReturnRole).toBe("lead");
    const heat1 = plan.assignments
      .filter((a) => a.heatIndex === 0)
      .sort((a, b) => a.danceOrder - b.danceOrder)
      .map((a) => a.entryId);
    expect(heat1).toHaveLength(15);
    expect(heat1[14]).toBe("l15");
  });

  it("asymmetric 20L/30F yields lead split 15+5 and 10 return leads", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 17,
      heatCountOverride: null,
      compType: "jack_and_jill",
      roundJudgedRole: "lead",
      leadCount: 20,
      followCount: 30,
      entries: leadEntries(20),
    });
    expect(plan.heatCount).toBe(2);
    expect(plan.heatSizes).toEqual([15, 5]);
    expect(plan.heatReturnCount).toBe(10);
    expect(plan.heatReturnRole).toBe("lead");
  });

  it("strictly 30 couples mirrors symmetric case", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 17,
      heatCountOverride: null,
      compType: "strictly",
      roundJudgedRole: null,
      leadCount: 30,
      followCount: 30,
      entries: coupleEntries(30),
    });
    expect(plan.heatCount).toBe(2);
    expect(plan.heatSizes).toEqual([15, 15]);
    expect(plan.heatReturnCount).toBe(0);
  });

  it("strictly 28 couples yields 2 heats of 14", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 15,
      heatCountOverride: null,
      compType: "strictly",
      roundJudgedRole: null,
      leadCount: 28,
      followCount: 28,
      entries: coupleEntries(28),
    });
    expect(plan.heatCount).toBe(2);
    expect(plan.couplesPerHeat).toEqual([14, 14]);
    expect(plan.heatSizes).toEqual([14, 14]);
    expect(plan.heatReturnCount).toBe(0);
  });

  it("preserves bib order within each heat", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 17,
      heatCountOverride: null,
      compType: "jack_and_jill",
      roundJudgedRole: "lead",
      leadCount: 20,
      followCount: 30,
      entries: leadEntries(20),
    });
    const heat1 = plan.assignments
      .filter((a) => a.heatIndex === 0)
      .sort((a, b) => a.danceOrder - b.danceOrder)
      .map((a) => a.entryId);
    expect(heat1).toEqual(Array.from({ length: 15 }, (_, i) => `l${i + 1}`));
  });

  it("assigns follow round entries with abundant split", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 17,
      heatCountOverride: null,
      compType: "jack_and_jill",
      roundJudgedRole: "follow",
      leadCount: 20,
      followCount: 30,
      entries: followEntries(30),
    });
    expect(plan.heatSizes).toEqual([15, 15]);
  });
});

describe("computeHeatPlan heat count override", () => {
  it("uses forced heat count but keeps floor-cap sizing and return math", () => {
    const plan = computeHeatPlan({
      maxFloorCouples: 17,
      heatCountOverride: 3,
      compType: "jack_and_jill",
      roundJudgedRole: "lead",
      leadCount: 30,
      followCount: 30,
      entries: leadEntries(30),
    });
    expect(plan.heatCount).toBe(3);
    expect(plan.couplesPerHeat).toEqual([10, 10, 10]);
    expect(plan.heatSizes).toEqual([10, 10, 10]);
    expect(plan.heatReturnCount).toBe(0);
    expect(plan.autoHeatCount).toBe(false);
  });
});

describe("previewAutoHeatCount", () => {
  it("matches auto heat count helper", () => {
    expect(
      previewAutoHeatCount({
        maxFloorCouples: 17,
        leadCount: 30,
        followCount: 30,
        compType: "jack_and_jill",
        entryCount: 30,
      })
    ).toBe(2);
  });
});
