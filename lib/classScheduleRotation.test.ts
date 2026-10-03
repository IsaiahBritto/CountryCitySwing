import { describe, it, expect } from "vitest";
import {
  filterAndSortTuesdayClassEvents,
  nextWeekLetter,
  resolveWeekLetterForEvent,
  type ClassScheduleEventInput,
} from "@/lib/classScheduleRotation";

const anchor = { anchor_date: "2025-09-29", anchor_week: "A" as const };

/** Tuesday 6:45 PM America/Chicago as UTC ISO (CDT/CST safe for tests). */
function tuesdayChicago645Utc(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(Date.UTC(y, m - 1, d, 18, 45, 0));
  const offsetMs = 5 * 60 * 60 * 1000;
  return new Date(local.getTime() + offsetMs).toISOString();
}

function tuesdayEvent(
  id: string,
  ymd: string,
  override?: string | null
): ClassScheduleEventInput {
  return {
    id,
    type: "class",
    starts_at: tuesdayChicago645Utc(ymd),
    time_zone: "America/Chicago",
    class_week_override: override ?? null,
  };
}

describe("classScheduleRotation", () => {
  it("advances A through C", () => {
    expect(nextWeekLetter("A")).toBe("B");
    expect(nextWeekLetter("B")).toBe("C");
    expect(nextWeekLetter("C")).toBe("A");
  });

  it("assigns anchor sequence Sep 29 through Oct 27", () => {
    const events = [
      tuesdayEvent("1", "2025-09-30"),
      tuesdayEvent("2", "2025-10-07"),
      tuesdayEvent("3", "2025-10-14"),
      tuesdayEvent("4", "2025-10-21"),
      tuesdayEvent("5", "2025-10-28"),
    ];
    const slots = new Map<string, { position?: string }[]>();

    expect(resolveWeekLetterForEvent(events[0], events, anchor, slots)).toBe("A");
    expect(resolveWeekLetterForEvent(events[1], events, anchor, slots)).toBe("B");
    expect(resolveWeekLetterForEvent(events[2], events, anchor, slots)).toBe("C");
    expect(resolveWeekLetterForEvent(events[3], events, anchor, slots)).toBe("A");
    expect(resolveWeekLetterForEvent(events[4], events, anchor, slots)).toBe("B");
  });

  it("respects per-event override", () => {
    const events = [tuesdayEvent("1", "2025-10-06", "C")];
    expect(resolveWeekLetterForEvent(events[0], events, anchor, new Map())).toBe("C");
  });

  it("chains from prior event beginner slots", () => {
    const events = [
      tuesdayEvent("1", "2025-09-30"),
      tuesdayEvent("2", "2025-10-07"),
    ];
    const slots = new Map<string, { position?: string }[]>([
      [
        "1",
        [{ position: "Beginner Lead Teacher Week A" }, { position: "Beginner Follow Teacher Week A" }],
      ],
    ]);
    expect(resolveWeekLetterForEvent(events[1], events, anchor, slots)).toBe("B");
  });

  it("filters only Tuesday class events", () => {
    const events: ClassScheduleEventInput[] = [
      tuesdayEvent("1", "2025-09-30"),
      { id: "2", type: "class", starts_at: tuesdayChicago645Utc("2025-10-01"), time_zone: "America/Chicago" },
      { id: "3", type: "social", starts_at: tuesdayChicago645Utc("2025-10-07"), time_zone: "America/Chicago" },
    ];
    expect(filterAndSortTuesdayClassEvents(events).map((e) => e.id)).toEqual(["1"]);
  });
});
