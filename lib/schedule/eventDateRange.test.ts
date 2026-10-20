import { describe, expect, it } from "vitest";
import {
  eventOverlapsChicagoDateRange,
  monthBoundsInChicago,
} from "@/lib/schedule/eventDateRange";

describe("monthBoundsInChicago", () => {
  it("returns first and last day of month", () => {
    expect(monthBoundsInChicago("2026-03-15")).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });
});

describe("eventOverlapsChicagoDateRange", () => {
  it("includes single-day event on start date in Chicago", () => {
    expect(
      eventOverlapsChicagoDateRange(
        {
          starts_at: "2026-04-10T01:00:00.000Z",
          type: "Social",
        },
        "2026-04-01",
        "2026-04-30"
      )
    ).toBe(true);
  });

  it("excludes event outside range", () => {
    expect(
      eventOverlapsChicagoDateRange(
        {
          starts_at: "2026-05-01T12:00:00.000Z",
          type: "Social",
        },
        "2026-04-01",
        "2026-04-30"
      )
    ).toBe(false);
  });

  it("includes convention spanning month boundary", () => {
    expect(
      eventOverlapsChicagoDateRange(
        {
          starts_at: "2026-04-28T12:00:00.000Z",
          ends_at: "2026-05-02T12:00:00.000Z",
          type: "Convention",
          time_zone: "America/Chicago",
        },
        "2026-04-01",
        "2026-04-30"
      )
    ).toBe(true);
  });
});
