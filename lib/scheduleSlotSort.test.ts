import { describe, it, expect } from "vitest";
import {
  compareScheduleSlotsForDisplay,
  sortScheduleSlotsForDisplay,
} from "@/lib/socialScheduleSlots";

describe("schedule slot display order", () => {
  it("orders Lead before Follow before Doorman regardless of created_at", () => {
    const slots = [
      {
        id: "d3",
        position: "Doorman",
        created_at: "2026-01-01T00:03:00.000Z",
      },
      {
        id: "f",
        position: "Beginner Follow Teacher Week B",
        created_at: "2026-01-01T00:04:00.000Z",
      },
      {
        id: "d1",
        position: "Doorman",
        created_at: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "l",
        position: "Beginner Lead Teacher Week B",
        created_at: "2026-01-01T00:05:00.000Z",
      },
      {
        id: "d2",
        position: "Doorman",
        created_at: "2026-01-01T00:02:00.000Z",
      },
    ];

    const sorted = sortScheduleSlotsForDisplay(slots);
    expect(sorted.map((s) => s.id)).toEqual(["l", "f", "d1", "d2", "d3"]);
  });

  it("sorts timed Doorman slots by slot_starts_at", () => {
    const a = {
      id: "2",
      position: "Doorman",
      slot_starts_at: "2026-06-01T22:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const b = {
      id: "1",
      position: "Doorman",
      slot_starts_at: "2026-06-01T21:00:00.000Z",
      created_at: "2026-01-01T00:01:00.000Z",
    };
    expect(compareScheduleSlotsForDisplay(a, b)).toBeGreaterThan(0);
    expect(sortScheduleSlotsForDisplay([a, b]).map((s) => s.id)).toEqual(["1", "2"]);
  });

  it("places timed slots before untimed when mixed", () => {
    const timed = {
      id: "t",
      position: "Doorman",
      slot_starts_at: "2026-06-01T23:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const lead = {
      id: "l",
      position: "Beginner Lead Teacher Week A",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    expect(compareScheduleSlotsForDisplay(timed, lead)).toBeLessThan(0);
  });
});
